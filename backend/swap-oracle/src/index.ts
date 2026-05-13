/**
 * GoodSwap Price Oracle Keeper
 *
 * Fetches crypto prices from CoinGecko (free API, no key needed) and pushes
 * them to the on-chain SwapPriceOracle contract on GoodDollar L2.
 *
 * Architecture:
 *   1. PriceFetcher — fetches USD prices from CoinGecko simple/price API
 *   2. OracleUpdater — calls SwapPriceOracle.batchUpdatePrices()
 *   3. Main loop — runs every INTERVAL_MS, batch-updates all tokens
 *
 * On devnet (Anvil), this provides real market prices for the DEX.
 * On mainnet, this serves as one of multiple oracle sources.
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();
const logger = pino({ name: 'swap-oracle' });

// ─── Configuration ───────────────────────────────────────────────────────────

const RPC_URL = process.env.L2_RPC_URL ?? 'http://localhost:8545';
const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ORACLE_ADDRESS = process.env.SWAP_ORACLE_ADDRESS ??
  '0xde2bd2ffea002b8e84adea96e5976af664115e2c';
const INTERVAL_MS = parseInt(process.env.UPDATE_INTERVAL_MS ?? '60000', 10);
const DEVIATION_THRESHOLD_BPS = parseInt(process.env.DEVIATION_BPS ?? '10', 10); // 0.1% min change to update

// Token mapping: on-chain address → CoinGecko ID
interface TokenMapping {
  address: string;
  coingeckoId: string;
  symbol: string;
}

const TOKENS: TokenMapping[] = [
  {
    address: process.env.GDOLLAR_ADDRESS ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    coingeckoId: 'gooddollar',
    symbol: 'G$',
  },
  {
    address: process.env.WETH_ADDRESS ?? '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    coingeckoId: 'ethereum',
    symbol: 'WETH',
  },
  {
    address: process.env.USDC_ADDRESS ?? '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    coingeckoId: 'usd-coin',
    symbol: 'USDC',
  },
  {
    address: process.env.WBTC_ADDRESS ?? '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    coingeckoId: 'wrapped-bitcoin',
    symbol: 'WBTC',
  },
];

// SwapPriceOracle ABI (only what we need)
const ORACLE_ABI = [
  'function batchUpdatePrices(address[] calldata tokens, uint256[] calldata prices) external',
  'function updatePrice(address token, uint256 price) external',
  'function getPriceUnsafe(address token) external view returns (uint256 price, uint256 timestamp)',
  'function getPrice(address token) external view returns (uint256)',
  'function admin() external view returns (address)',
];

// ─── Price Fetcher ───────────────────────────────────────────────────────────

interface PriceResult {
  token: TokenMapping;
  priceUsd: number;
  priceChainlink: bigint; // 8-decimal format
}

/**
 * Fetch crypto prices from CoinGecko free API.
 * Rate limit: 10-30 calls/minute (free tier).
 */
async function fetchPrices(tokens: TokenMapping[]): Promise<PriceResult[]> {
  const ids = tokens.map(t => t.coingeckoId).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();

    const results: PriceResult[] = [];
    for (const token of tokens) {
      const entry = data[token.coingeckoId];
      if (!entry || !entry.usd) {
        logger.warn({ token: token.symbol, id: token.coingeckoId }, 'No price from CoinGecko');
        continue;
      }
      const priceUsd = entry.usd as number;
      // Convert to 8-decimal Chainlink format
      const priceChainlink = BigInt(Math.round(priceUsd * 1e8));

      results.push({ token, priceUsd, priceChainlink });
    }
    return results;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch prices from CoinGecko');
    return [];
  }
}

// ─── Oracle Updater ──────────────────────────────────────────────────────────

let lastPrices = new Map<string, bigint>();

/**
 * Check if a price has deviated enough to warrant an on-chain update.
 */
function hasDeviatedEnough(address: string, newPrice: bigint): boolean {
  const old = lastPrices.get(address);
  if (!old) return true; // first price always updates

  const diff = newPrice > old ? newPrice - old : old - newPrice;
  const bps = (diff * 10_000n) / old;
  return bps >= BigInt(DEVIATION_THRESHOLD_BPS);
}

async function updateOnChain(
  oracle: ethers.Contract,
  results: PriceResult[],
): Promise<void> {
  // Filter to only tokens that have deviated enough
  const toUpdate = results.filter(r => hasDeviatedEnough(r.token.address, r.priceChainlink));

  if (toUpdate.length === 0) {
    logger.debug('No price deviations above threshold, skipping update');
    return;
  }

  const addresses = toUpdate.map(r => r.token.address);
  const prices = toUpdate.map(r => r.priceChainlink);

  try {
    const tx = await oracle.batchUpdatePrices(addresses, prices);
    const receipt = await tx.wait();

    for (const r of toUpdate) {
      lastPrices.set(r.token.address, r.priceChainlink);
    }

    logger.info(
      {
        updated: toUpdate.map(r => `${r.token.symbol}=$${r.priceUsd}`).join(', '),
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
      },
      `Updated ${toUpdate.length} prices on-chain`,
    );
  } catch (err: any) {
    // If batch fails (e.g., deviation too high on one), try individual updates
    logger.warn({ err: err.message }, 'Batch update failed, trying individual updates');

    for (const r of toUpdate) {
      try {
        const tx = await oracle.updatePrice(r.token.address, r.priceChainlink);
        await tx.wait();
        lastPrices.set(r.token.address, r.priceChainlink);
        logger.info({ token: r.token.symbol, price: r.priceUsd }, 'Individual update succeeded');
      } catch (innerErr: any) {
        logger.error(
          { token: r.token.symbol, price: r.priceUsd, err: innerErr.message },
          'Individual update failed',
        );
      }
    }
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

async function main() {
  logger.info({
    rpc: RPC_URL,
    oracle: ORACLE_ADDRESS,
    interval: INTERVAL_MS,
    tokens: TOKENS.map(t => t.symbol),
  }, 'Starting GoodSwap Price Oracle Keeper');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(OPERATOR_KEY, provider);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, wallet);

  // Verify connection
  try {
    const admin = await oracle.admin();
    logger.info({ admin, operator: wallet.address }, 'Connected to SwapPriceOracle');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to oracle contract');
    process.exit(1);
  }

  // Initial fetch + load last known prices
  for (const token of TOKENS) {
    try {
      const [price] = await oracle.getPriceUnsafe(token.address);
      if (price > 0n) {
        lastPrices.set(token.address, price);
        logger.info({ token: token.symbol, price: Number(price) / 1e8 }, 'Loaded existing price');
      }
    } catch {
      // Token might not have a price yet
    }
  }

  // Run loop
  const tick = async () => {
    try {
      const results = await fetchPrices(TOKENS);
      if (results.length > 0) {
        await updateOnChain(oracle, results);
      }
    } catch (err) {
      logger.error({ err }, 'Tick error');
    }
  };

  // First tick immediately
  await tick();

  // Then on interval
  setInterval(tick, INTERVAL_MS);
  logger.info(`Price keeper running, updating every ${INTERVAL_MS / 1000}s`);
}

main().catch(err => {
  logger.fatal({ err }, 'Fatal error');
  process.exit(1);
});
