/**
 * Hyperliquid External Order Router
 *
 * Routes orders to Hyperliquid when internal GoodPerps liquidity is thin.
 * Implements the hybrid model: off-chain CLOB internally + external routing.
 *
 * Flow:
 * 1. MatchingEngine emits 'routeExternal' for unfilled market order remainder
 * 2. Router checks Hyperliquid book depth for best execution
 * 3. Places order on Hyperliquid via Exchange API (EIP-712 signed)
 * 4. Mirrors fill back to user's GoodPerps position
 * 5. Protocol holds hedging position on Hyperliquid
 *
 * For now (devnet), we simulate fills using Hyperliquid's real-time prices
 * but don't actually sign/submit exchange orders (no real funds).
 * Production mode will use EIP-712 signatures with a funded account.
 */

import { EventEmitter } from 'events';
import BigNumber from 'bignumber.js';
import pino from 'pino';
import { HyperliquidFeed, HyperliquidBook, HyperliquidL2Level } from '../feeds/HyperliquidFeed';
import { Side, Trade } from '../orderbook/types';
import { v4 as uuidv4 } from 'uuid';

const logger = pino({ name: 'hl-router' });

export interface ExternalRouteRequest {
  market: string;
  side: Side;
  size: string;
  userId: string;
  orderId: string;
}

export interface ExternalFill {
  id: string;
  market: string;
  side: Side;
  price: string;       // Average fill price
  size: string;        // Filled size
  fee: string;         // Fee charged
  userId: string;
  orderId: string;     // Original GoodPerps order ID
  source: 'hyperliquid';
  hlOrderId?: string;  // Hyperliquid order ID (production)
  timestamp: number;
  simulated: boolean;  // true on devnet
}

export interface RouterStats {
  totalRoutedOrders: number;
  totalRoutedVolume: string;
  totalFills: number;
  totalFeesCollected: string;
  pendingRoutes: number;
  lastRouteTimestamp: number | null;
  mode: 'simulation' | 'production';
}

// Market → Hyperliquid coin mapping
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

// Hyperliquid asset index mapping (for Exchange API orders)
const HL_ASSET_INDEX: Record<string, number> = {
  'BTC': 0,
  'ETH': 1,
  'SOL': 4,
  'DOGE': 9,
  'AVAX': 12,
  'ARB': 42,
  'OP': 32,
  'LINK': 14,
};

// Fee we charge on top of external fills (goes to UBI fee split)
const EXTERNAL_ROUTING_FEE_RATE = '0.0003'; // 0.03% on top of HL fees

export class HyperliquidRouter extends EventEmitter {
  private hlFeed: HyperliquidFeed;
  private pendingRoutes: Map<string, ExternalRouteRequest> = new Map();
  private fills: ExternalFill[] = [];
  private stats: RouterStats;
  private mode: 'simulation' | 'production';

  // Production mode config (unused in simulation)
  private hlAccountAddress?: string;
  private hlPrivateKey?: string;

  constructor(
    hlFeed: HyperliquidFeed,
    options: {
      mode?: 'simulation' | 'production';
      hlAccountAddress?: string;
      hlPrivateKey?: string;
    } = {},
  ) {
    super();
    this.hlFeed = hlFeed;
    this.mode = options.mode ?? 'simulation';
    this.hlAccountAddress = options.hlAccountAddress;
    this.hlPrivateKey = options.hlPrivateKey;

    this.stats = {
      totalRoutedOrders: 0,
      totalRoutedVolume: '0',
      totalFills: 0,
      totalFeesCollected: '0',
      pendingRoutes: 0,
      lastRouteTimestamp: null,
      mode: this.mode,
    };

    if (this.mode === 'production' && (!this.hlAccountAddress || !this.hlPrivateKey)) {
      logger.warn('Production mode requires hlAccountAddress and hlPrivateKey — falling back to simulation');
      this.mode = 'simulation';
      this.stats.mode = 'simulation';
    }
  }

  /**
   * Route an order to Hyperliquid for external execution.
   * Called when MatchingEngine has unfilled remainder on a market order.
   */
  async routeOrder(request: ExternalRouteRequest): Promise<ExternalFill | null> {
    const hlCoin = MARKET_TO_HL_COIN[request.market];
    if (!hlCoin) {
      logger.warn({ market: request.market }, 'No Hyperliquid mapping for market — cannot route');
      return null;
    }

    const routeId = uuidv4();
    this.pendingRoutes.set(routeId, request);
    this.stats.pendingRoutes = this.pendingRoutes.size;

    logger.info({
      routeId,
      market: request.market,
      side: request.side,
      size: request.size,
      userId: request.userId,
      mode: this.mode,
    }, 'Routing order to Hyperliquid');

    try {
      let fill: ExternalFill;

      if (this.mode === 'production') {
        fill = await this.executeOnHyperliquid(routeId, request, hlCoin);
      } else {
        fill = await this.simulateHyperliquidFill(routeId, request, hlCoin);
      }

      // Update stats
      this.stats.totalRoutedOrders++;
      this.stats.totalRoutedVolume = new BigNumber(this.stats.totalRoutedVolume)
        .plus(new BigNumber(fill.price).times(fill.size))
        .toString();
      this.stats.totalFills++;
      this.stats.totalFeesCollected = new BigNumber(this.stats.totalFeesCollected)
        .plus(fill.fee)
        .toString();
      this.stats.lastRouteTimestamp = Date.now();

      this.fills.push(fill);
      // Keep last 1000 fills
      if (this.fills.length > 1000) {
        this.fills = this.fills.slice(-1000);
      }

      this.emit('fill', fill);
      logger.info({
        routeId,
        fillId: fill.id,
        price: fill.price,
        size: fill.size,
        fee: fill.fee,
      }, 'External fill completed');

      return fill;
    } catch (err) {
      logger.error({ err, routeId, market: request.market }, 'External routing failed');
      this.emit('routeError', { routeId, request, error: err });
      return null;
    } finally {
      this.pendingRoutes.delete(routeId);
      this.stats.pendingRoutes = this.pendingRoutes.size;
    }
  }

  /**
   * Simulate a fill using Hyperliquid's real-time book data.
   * Used on devnet where we don't have funded accounts.
   */
  private async simulateHyperliquidFill(
    routeId: string,
    request: ExternalRouteRequest,
    hlCoin: string,
  ): Promise<ExternalFill> {
    // Try to get real book data
    let book: HyperliquidBook | null = this.hlFeed.getBook(hlCoin);

    if (!book) {
      // Fetch fresh book
      try {
        book = await this.hlFeed.fetchL2Book(hlCoin);
      } catch {
        // Fall back to mid price
      }
    }

    let avgPrice: BigNumber;
    const size = new BigNumber(request.size);

    if (book && book.levels) {
      // Walk the book to simulate fill
      const levels = request.side === Side.Buy ? book.levels[1] : book.levels[0]; // asks for buy, bids for sell
      if (!levels || levels.length === 0) {
        // Empty levels array — fall back to mid price rather than returning zero
        const mid = this.hlFeed.getMidPrice(hlCoin);
        if (mid) {
          avgPrice = new BigNumber(mid);
        } else {
          throw new Error(`No price data available for ${hlCoin} on Hyperliquid`);
        }
      } else {
        avgPrice = this.walkBook(levels, size);
      }
    } else {
      // Use mid price as fallback
      const mid = this.hlFeed.getMidPrice(hlCoin);
      if (mid) {
        avgPrice = new BigNumber(mid);
      } else {
        throw new Error(`No price data available for ${hlCoin} on Hyperliquid`);
      }
    }

    // Apply slippage simulation for market orders (0.01-0.05%)
    const slippageBps = Math.random() * 4 + 1; // 1-5 bps
    const slippageMultiplier = request.side === Side.Buy
      ? 1 + slippageBps / 10000
      : 1 - slippageBps / 10000;
    avgPrice = avgPrice.times(slippageMultiplier);

    // Calculate fee
    const notional = avgPrice.times(size);
    const fee = notional.times(EXTERNAL_ROUTING_FEE_RATE);

    return {
      id: `xfill-${routeId}`,
      market: request.market,
      side: request.side,
      price: avgPrice.decimalPlaces(2).toString(),
      size: request.size,
      fee: fee.decimalPlaces(6).toString(),
      userId: request.userId,
      orderId: request.orderId,
      source: 'hyperliquid',
      timestamp: Date.now(),
      simulated: true,
    };
  }

  /**
   * Execute a real order on Hyperliquid via the Exchange API.
   * Uses EIP-712 signed messages to place orders on the protocol-owned account.
   */
  private async executeOnHyperliquid(
    routeId: string,
    request: ExternalRouteRequest,
    hlCoin: string,
  ): Promise<ExternalFill> {
    const assetIndex = HL_ASSET_INDEX[hlCoin];
    if (assetIndex === undefined) {
      throw new Error(`Unknown Hyperliquid asset index for ${hlCoin}`);
    }

    // Build order payload
    const isBuy = request.side === Side.Buy;
    const size = new BigNumber(request.size);

    // Get current mid for a reasonable limit price (market orders use aggressive limit)
    const mid = this.hlFeed.getMidPrice(hlCoin);
    if (!mid) {
      throw new Error(`No mid price for ${hlCoin} — cannot determine limit price`);
    }

    // Set aggressive limit: 0.5% above mid for buy, 0.5% below for sell
    const midBN = new BigNumber(mid);
    const limitPrice = isBuy
      ? midBN.times(1.005).decimalPlaces(1)
      : midBN.times(0.995).decimalPlaces(1);

    const orderAction = {
      type: 'order',
      orders: [{
        a: assetIndex,
        b: isBuy,
        p: limitPrice.toString(),
        s: size.toString(),
        r: false,           // not reduce-only
        t: { limit: { tif: 'Ioc' } }, // IOC for immediate execution
      }],
      grouping: 'na',
    };

    const nonce = Date.now();

    // TODO: In production, sign with EIP-712 and submit to exchange endpoint
    // For now, this path is only reached if mode === 'production' and keys are set
    // Actual signing requires ethers.js Wallet + EIP-712 typed data signing
    // which is complex — will be implemented when we have a funded HL account

    logger.info({
      routeId,
      orderAction,
      nonce,
      hlAccount: this.hlAccountAddress,
    }, 'Would submit to Hyperliquid Exchange API (not yet implemented)');

    // Fall back to simulation for now
    return this.simulateHyperliquidFill(routeId, request, hlCoin);
  }

  /**
   * Walk an order book to calculate average fill price for a given size.
   */
  private walkBook(levels: HyperliquidL2Level[], targetSize: BigNumber): BigNumber {
    if (levels.length === 0) {
      return new BigNumber(0); // Caller must guard against empty levels before calling
    }

    let remainingSize = targetSize;
    let totalCost = new BigNumber(0);

    for (const level of levels) {
      if (remainingSize.lte(0)) break;

      const levelPrice = new BigNumber(level.px);
      const levelSize = new BigNumber(level.sz);
      const fillSize = BigNumber.min(remainingSize, levelSize);

      totalCost = totalCost.plus(levelPrice.times(fillSize));
      remainingSize = remainingSize.minus(fillSize);
    }

    // If we couldn't fill the entire size from the book, use last level price for remainder
    if (remainingSize.gt(0) && levels.length > 0) {
      const lastPrice = new BigNumber(levels[levels.length - 1].px);
      totalCost = totalCost.plus(lastPrice.times(remainingSize));
    }

    const filledSize = targetSize;
    return totalCost.div(filledSize);
  }

  /**
   * Check available external liquidity for a market.
   * Returns the depth available on Hyperliquid for a given side.
   */
  getExternalLiquidity(market: string, side: Side): { levels: number; totalSize: string; bestPrice: string | null } {
    const hlCoin = MARKET_TO_HL_COIN[market];
    if (!hlCoin) return { levels: 0, totalSize: '0', bestPrice: null };

    const book = this.hlFeed.getBook(hlCoin);
    if (!book || !book.levels) return { levels: 0, totalSize: '0', bestPrice: null };

    const bookSide = side === Side.Buy ? book.levels[1] : book.levels[0]; // asks for buy, bids for sell
    const totalSize = bookSide.reduce(
      (sum, lvl) => sum.plus(lvl.sz),
      new BigNumber(0),
    );

    return {
      levels: bookSide.length,
      totalSize: totalSize.toString(),
      bestPrice: bookSide.length > 0 ? bookSide[0].px : null,
    };
  }

  /**
   * Get recent external fills.
   */
  getRecentFills(limit: number = 50): ExternalFill[] {
    return this.fills.slice(-limit);
  }

  /**
   * Get fills for a specific user.
   */
  getUserFills(userId: string, limit: number = 50): ExternalFill[] {
    return this.fills
      .filter(f => f.userId === userId)
      .slice(-limit);
  }

  /**
   * Get router stats.
   */
  getStats(): RouterStats {
    return { ...this.stats };
  }
}
