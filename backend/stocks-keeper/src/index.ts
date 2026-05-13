/**
 * GoodStocks Price Keeper
 *
 * Fetches real-time stock prices from Yahoo Finance (via free API) and
 * pushes them to the on-chain PriceOracle contract on GoodDollar L2.
 *
 * Architecture:
 *   1. PriceFetcher — fetches prices from Yahoo Finance v8 API (no key needed)
 *   2. OracleUpdater — calls PriceOracle.setManualPrice() for each ticker
 *   3. Main loop — runs every INTERVAL_MS, updates all configured tickers
 *
 * On devnet (Anvil), this replaces Chainlink feeds with real market prices.
 * On mainnet, this serves as a fallback / backup oracle.
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();
const logger = pino({ name: 'stocks-keeper' });

// ─── Configuration ───────────────────────────────────────────────────────────

const RPC_URL = process.env.L2_RPC_URL ?? 'http://localhost:8545';
const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY ?? '';
const ORACLE_ADDRESS = process.env.PRICE_ORACLE_ADDRESS ?? '';
const INTERVAL_MS = parseInt(process.env.UPDATE_INTERVAL_MS ?? '60000', 10); // 1 minute
const DEVIATION_THRESHOLD_BPS = parseInt(process.env.DEVIATION_BPS ?? '50', 10); // 0.5%

// Stock tickers to track
const TICKERS = [
  'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN',
  'GOOGL', 'META', 'JPM', 'V', 'DIS', 'NFLX', 'AMD',
];

// PriceOracle ABI (only what we need)
const ORACLE_ABI = [
  'function setManualPrice(string calldata ticker, uint256 price, bool active) external',
  'function getPrice(string calldata ticker) external view returns (uint256)',
  'function hasFeed(string calldata ticker) external view returns (bool)',
  'function admin() external view returns (address)',
];

// ─── Price Fetcher ───────────────────────────────────────────────────────────

interface StockQuote {
  ticker: string;
  price: number;        // USD price (e.g., 178.72)
  priceChainlink: bigint; // 8-decimal Chainlink format (e.g., 17872000000n)
  timestamp: number;
}

/**
 * Fetch stock prices from Yahoo Finance v8 API (free, no key needed).
 * Falls back to a simple scraping approach if the API changes.
 */
async function fetchPrices(tickers: string[]): Promise<StockQuote[]> {
  const quotes: StockQuote[] = [];
  const symbols = tickers.join(',');

  try {
    // Yahoo Finance v8 quote API
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbols}?range=1d&interval=1m&includePrePost=false`;
    
    // Try individual fetches for reliability
    for (const ticker of tickers) {
      try {
        const resp = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1m`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; GoodStocksKeeper/1.0)',
            },
          }
        );

        if (!resp.ok) {
          logger.warn({ ticker, status: resp.status }, 'Yahoo Finance API error, trying fallback');
          const fallbackQuote = await fetchFromFallback(ticker);
          if (fallbackQuote) quotes.push(fallbackQuote);
          continue;
        }

        const data = await resp.json() as any;
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) {
          logger.warn({ ticker }, 'No market price in response');
          continue;
        }

        const price = meta.regularMarketPrice;
        quotes.push({
          ticker,
          price,
          priceChainlink: BigInt(Math.round(price * 1e8)),
          timestamp: Date.now(),
        });
      } catch (err) {
        logger.error({ ticker, err }, 'Failed to fetch price');
      }

      // Rate limiting — 200ms between requests
      await sleep(200);
    }
  } catch (err) {
    logger.error({ err }, 'Batch price fetch failed');
  }

  return quotes;
}

/**
 * Fallback: fetch from Google Finance (scrape-based, less reliable)
 */
async function fetchFromFallback(ticker: string): Promise<StockQuote | null> {
  try {
    // Use a simple finance API endpoint
    const resp = await fetch(
      `https://www.google.com/finance/quote/${ticker}:NASDAQ`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    
    if (!resp.ok) return null;
    
    const html = await resp.text();
    // Look for the price in the page data
    const priceMatch = html.match(/data-last-price="([0-9.]+)"/);
    if (!priceMatch) return null;

    const price = parseFloat(priceMatch[1]);
    if (isNaN(price) || price <= 0) return null;

    return {
      ticker,
      price,
      priceChainlink: BigInt(Math.round(price * 1e8)),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

// ─── Oracle Updater ──────────────────────────────────────────────────────────

class OracleUpdater {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private oracle: ethers.Contract;
  private lastPrices: Map<string, bigint> = new Map();

  constructor(rpcUrl: string, operatorKey: string, oracleAddress: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(operatorKey, this.provider);
    this.oracle = new ethers.Contract(oracleAddress, ORACLE_ABI, this.wallet);
  }

  /**
   * Check if a price has deviated enough to warrant an on-chain update.
   * Avoids unnecessary gas spending for tiny price movements.
   */
  shouldUpdate(ticker: string, newPrice: bigint): boolean {
    const lastPrice = this.lastPrices.get(ticker);
    if (!lastPrice) return true; // First time — always update

    if (lastPrice === 0n) return true;
    const diff = newPrice > lastPrice ? newPrice - lastPrice : lastPrice - newPrice;
    const deviationBps = (diff * 10000n) / lastPrice;
    return deviationBps >= BigInt(DEVIATION_THRESHOLD_BPS);
  }

  /**
   * Push a price update to the on-chain oracle.
   */
  async updatePrice(quote: StockQuote): Promise<boolean> {
    try {
      if (!this.shouldUpdate(quote.ticker, quote.priceChainlink)) {
        logger.debug({ ticker: quote.ticker, price: quote.price }, 'Price within threshold, skipping');
        return false;
      }

      const tx = await this.oracle.setManualPrice(
        quote.ticker,
        quote.priceChainlink,
        true, // active = true (use manual price)
        { gasLimit: 100_000 }
      );

      const receipt = await tx.wait();
      this.lastPrices.set(quote.ticker, quote.priceChainlink);

      logger.info({
        ticker: quote.ticker,
        price: quote.price,
        chainlinkPrice: quote.priceChainlink.toString(),
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
      }, 'Price updated on-chain');

      return true;
    } catch (err) {
      logger.error({ ticker: quote.ticker, err }, 'Failed to update price on-chain');
      return false;
    }
  }

  /**
   * Read the current on-chain price for a ticker.
   */
  async getOnChainPrice(ticker: string): Promise<bigint> {
    try {
      const price = await this.oracle.getPrice(ticker);
      return price;
    } catch {
      return 0n;
    }
  }

  /**
   * Initialize lastPrices from on-chain state.
   */
  async init(): Promise<void> {
    logger.info('Initializing — reading current on-chain prices');
    for (const ticker of TICKERS) {
      const price = await this.getOnChainPrice(ticker);
      if (price > 0n) {
        this.lastPrices.set(ticker, price);
        logger.info({ ticker, price: price.toString() }, 'Loaded on-chain price');
      }
    }
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCycle(updater: OracleUpdater): Promise<void> {
  logger.info('Starting price update cycle');

  const quotes = await fetchPrices(TICKERS);
  logger.info({ fetched: quotes.length, total: TICKERS.length }, 'Prices fetched');

  let updated = 0;
  for (const quote of quotes) {
    const didUpdate = await updater.updatePrice(quote);
    if (didUpdate) updated++;
  }

  logger.info({ updated, skipped: quotes.length - updated }, 'Cycle complete');
}

async function main(): Promise<void> {
  logger.info({
    rpcUrl: RPC_URL,
    oracle: ORACLE_ADDRESS,
    tickers: TICKERS.length,
    intervalMs: INTERVAL_MS,
    deviationBps: DEVIATION_THRESHOLD_BPS,
  }, 'GoodStocks Price Keeper starting');

  if (!OPERATOR_KEY) {
    logger.error('OPERATOR_PRIVATE_KEY not set');
    process.exit(1);
  }
  if (!ORACLE_ADDRESS) {
    logger.error('PRICE_ORACLE_ADDRESS not set');
    process.exit(1);
  }

  const updater = new OracleUpdater(RPC_URL, OPERATOR_KEY, ORACLE_ADDRESS);
  await updater.init();

  // Run first cycle immediately
  await runCycle(updater);

  // Then loop
  while (true) {
    await sleep(INTERVAL_MS);
    try {
      await runCycle(updater);
    } catch (err) {
      logger.error({ err }, 'Cycle failed');
    }
  }
}

main().catch(err => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});

export { fetchPrices, OracleUpdater, StockQuote, TICKERS };
