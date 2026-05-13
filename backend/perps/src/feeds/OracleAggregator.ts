/**
 * Oracle Aggregator
 *
 * Combines prices from multiple sources (Pyth, Hyperliquid, Chainlink)
 * to produce a reliable mark price and index price for each market.
 *
 * Mark Price = median(Pyth, Hyperliquid mid, Chainlink)
 * Index Price = Pyth (primary), Chainlink (fallback)
 * Funding Rate = (Mark - Index) / Index * (1/24)
 */

import { EventEmitter } from 'events';
import BigNumber from 'bignumber.js';
import { HyperliquidFeed } from './HyperliquidFeed';
import { PythFeed } from './PythFeed';
import pino from 'pino';

const logger = pino({ name: 'oracle-aggregator' });

export interface OraclePrice {
  market: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  sources: {
    pyth?: string;
    hyperliquid?: string;
    chainlink?: string;
  };
  timestamp: number;
  stale: boolean;
}

// Market → coin mapping for Hyperliquid
const MARKET_TO_HL_COIN: Record<string, string> = {
  'BTC-USD': 'BTC',
  'ETH-USD': 'ETH',
  'SOL-USD': 'SOL',
  'DOGE-USD': 'DOGE',
  'AVAX-USD': 'AVAX',
  'ARB-USD': 'ARB',
  'OP-USD': 'OP',
  'LINK-USD': 'LINK',
};

const MAX_STALENESS_MS = 60_000; // 60 seconds

export class OracleAggregator extends EventEmitter {
  private hlFeed: HyperliquidFeed;
  private pythFeed: PythFeed;
  private markets: string[] = [];
  private latestPrices: Map<string, OraclePrice> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  // Per-source prices with timestamps
  private pythPrices: Map<string, { price: string; ts: number }> = new Map();
  private hlPrices: Map<string, { price: string; ts: number }> = new Map();
  private chainlinkPrices: Map<string, { price: string; ts: number }> = new Map();

  constructor(hlFeed: HyperliquidFeed, pythFeed: PythFeed) {
    super();
    this.hlFeed = hlFeed;
    this.pythFeed = pythFeed;

    // Listen to price updates
    this.hlFeed.on('mids', (mids: Record<string, string>) => {
      const now = Date.now();
      for (const [coin, price] of Object.entries(mids)) {
        // Find market for this coin
        for (const [market, hlCoin] of Object.entries(MARKET_TO_HL_COIN)) {
          if (hlCoin === coin) {
            this.hlPrices.set(market, { price, ts: now });
          }
        }
      }
    });

    this.pythFeed.on('price', (update: { market: string; price: string; timestamp: number }) => {
      this.pythPrices.set(update.market, { price: update.price, ts: update.timestamp });
    });
  }

  /**
   * Start the oracle aggregator for given markets.
   */
  async start(markets: string[]): Promise<void> {
    this.markets = markets;

    // Connect feeds
    const hlCoins = markets.map(m => MARKET_TO_HL_COIN[m]).filter(Boolean);
    await Promise.all([
      this.hlFeed.connect(hlCoins),
      this.pythFeed.connect(markets),
    ]);

    // Update aggregated prices every 500ms
    this.updateInterval = setInterval(() => {
      this.updateAllPrices();
    }, 500);

    logger.info({ markets }, 'Oracle aggregator started');
  }

  /**
   * Stop the oracle.
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.hlFeed.disconnect();
    this.pythFeed.disconnect();
  }

  /**
   * Get oracle price for a market.
   */
  getPrice(market: string): OraclePrice | null {
    return this.latestPrices.get(market) ?? null;
  }

  /**
   * Get mark price for a market.
   */
  getMarkPrice(market: string): string | null {
    return this.latestPrices.get(market)?.markPrice ?? null;
  }

  /**
   * Get index price for a market.
   */
  getIndexPrice(market: string): string | null {
    return this.latestPrices.get(market)?.indexPrice ?? null;
  }

  /**
   * Set Chainlink price (called by contract reader).
   */
  setChainlinkPrice(market: string, price: string): void {
    this.chainlinkPrices.set(market, { price, ts: Date.now() });
  }

  // --- Private ---

  private updateAllPrices(): void {
    const now = Date.now();

    for (const market of this.markets) {
      const sources: OraclePrice['sources'] = {};
      const validPrices: BigNumber[] = [];
      let stale = false;

      // Pyth
      const pyth = this.pythPrices.get(market);
      if (pyth && (now - pyth.ts) < MAX_STALENESS_MS) {
        sources.pyth = pyth.price;
        validPrices.push(new BigNumber(pyth.price));
      }

      // Hyperliquid
      const hl = this.hlPrices.get(market);
      if (hl && (now - hl.ts) < MAX_STALENESS_MS) {
        sources.hyperliquid = hl.price;
        validPrices.push(new BigNumber(hl.price));
      }

      // Chainlink
      const cl = this.chainlinkPrices.get(market);
      if (cl && (now - cl.ts) < MAX_STALENESS_MS) {
        sources.chainlink = cl.price;
        validPrices.push(new BigNumber(cl.price));
      }

      if (validPrices.length === 0) {
        stale = true;
        // Use last known price if available
        const existing = this.latestPrices.get(market);
        if (existing) {
          existing.stale = true;
          this.latestPrices.set(market, existing);
        }
        continue;
      }

      // Mark price = median of available sources
      const markPrice = this.median(validPrices);

      // Index price = Pyth (primary) or first available
      const indexPrice = pyth
        ? new BigNumber(pyth.price)
        : validPrices[0];

      // Funding rate = (mark - index) / index * (1/24)
      // Capped at ±0.1% per hour
      let fundingRate = markPrice.minus(indexPrice).div(indexPrice).div(24);
      const maxRate = new BigNumber('0.001'); // 0.1%
      if (fundingRate.abs().gt(maxRate)) {
        fundingRate = fundingRate.gt(0) ? maxRate : maxRate.negated();
      }

      const oraclePrice: OraclePrice = {
        market,
        markPrice: markPrice.toString(),
        indexPrice: indexPrice.toString(),
        fundingRate: fundingRate.toString(),
        sources,
        timestamp: now,
        stale,
      };

      this.latestPrices.set(market, oraclePrice);
      this.emit('price', oraclePrice);
    }
  }

  private median(values: BigNumber[]): BigNumber {
    if (values.length === 0) throw new Error('No values for median');
    if (values.length === 1) return values[0];

    const sorted = [...values].sort((a, b) => a.comparedTo(b) ?? 0);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return sorted[mid - 1].plus(sorted[mid]).div(2);
    }
    return sorted[mid];
  }
}
