/**
 * Smart Order Router (SOR)
 *
 * Decides how to split orders between internal GoodPerps book and
 * external venues (Hyperliquid, GMX V2, dYdX V4) for best execution.
 *
 * Strategy:
 * 1. Check internal book depth for the requested side/size
 * 2. Query ALL connected external venues for quotes
 * 3. Rank venues by effective price (including fees)
 * 4. Route optimally:
 *    - If internal can fill at best price → fill internally
 *    - If an external venue is better → route there
 *    - If split across venues reduces avg price → split
 *
 * Multi-venue architecture:
 *   - Hyperliquid: CLOB with real-time WebSocket book data
 *   - GMX V2: Pool-based oracle pricing (no slippage within OI caps)
 *   - dYdX V4: Cosmos CLOB with deep liquidity
 *
 * The SOR replaces the simple "route remainder" logic in MatchingEngine.
 */

import BigNumber from 'bignumber.js';
import pino from 'pino';
import { MatchingEngine } from '../orderbook/MatchingEngine';
import { HyperliquidRouter, ExternalFill, ExternalRouteRequest } from './HyperliquidRouter';
import { HyperliquidFeed, HyperliquidL2Level } from '../feeds/HyperliquidFeed';
import { ExternalVenue, VenueQuote, VenueFill } from './ExternalVenue';
import { Side, OrderType, Trade, L2Level } from '../orderbook/types';

const logger = pino({ name: 'smart-order-router' });

export interface SORResult {
  internalFills: Trade[];
  externalFills: Array<ExternalFill | VenueFill>;
  totalFilledSize: string;
  avgPrice: string;
  totalFees: string;
  splitRatio: { internal: string; external: string };
  venueBreakdown: { venue: string; size: string; avgPrice: string }[];
}

export interface SORQuote {
  market: string;
  side: Side;
  size: string;
  internalAvgPrice: string | null;
  internalAvailableSize: string;
  externalAvgPrice: string | null;
  externalAvailableSize: string;
  bestRoute: 'internal' | 'external' | 'split';
  estimatedAvgPrice: string;
  estimatedFee: string;
  venueQuotes?: VenueQuote[];
}

// Minimum improvement required to split (in bps)
const MIN_SPLIT_IMPROVEMENT_BPS = 2; // 0.02% better to justify split complexity

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

export class SmartOrderRouter {
  private engine: MatchingEngine;
  private hlRouter: HyperliquidRouter;
  private hlFeed: HyperliquidFeed;
  private externalVenues: ExternalVenue[] = [];

  constructor(
    engine: MatchingEngine,
    hlRouter: HyperliquidRouter,
    hlFeed: HyperliquidFeed,
  ) {
    this.engine = engine;
    this.hlRouter = hlRouter;
    this.hlFeed = hlFeed;
  }

  /**
   * Register an additional external venue (GMX V2, dYdX V4, etc.)
   */
  addVenue(venue: ExternalVenue): void {
    this.externalVenues.push(venue);
    logger.info({ venue: venue.name, markets: venue.getSupportedMarkets() },
      'Registered external venue');
  }

  /**
   * Remove a venue by name
   */
  removeVenue(name: string): void {
    this.externalVenues = this.externalVenues.filter(v => v.name !== name);
    logger.info({ venue: name }, 'Removed external venue');
  }

  /**
   * Get all registered external venues
   */
  getVenues(): { name: string; ready: boolean; markets: string[] }[] {
    const venues = [
      { name: 'hyperliquid', ready: true, markets: Object.keys(MARKET_TO_HL_COIN) },
    ];
    for (const v of this.externalVenues) {
      venues.push({ name: v.name, ready: v.isReady(), markets: v.getSupportedMarkets() });
    }
    return venues;
  }

  /**
   * Get quotes from all available external venues for a market.
   */
  async getVenueQuotes(market: string, side: Side, size: string): Promise<VenueQuote[]> {
    const quotes: VenueQuote[] = [];

    // Hyperliquid (via legacy path)
    const hlCoin = MARKET_TO_HL_COIN[market];
    if (hlCoin) {
      const hlResult = this.simulateExternalFill(hlCoin, side, new BigNumber(size));
      if (hlResult.avgPrice) {
        const notional = new BigNumber(hlResult.avgPrice).times(hlResult.availableSize);
        quotes.push({
          venue: 'hyperliquid',
          market,
          side,
          availableSize: hlResult.availableSize,
          avgPrice: hlResult.avgPrice,
          fee: notional.times(0.0005).toFixed(2), // 5bps
          latencyMs: 200,
        });
      }
    }

    // Query all registered external venues in parallel
    const venuePromises = this.externalVenues
      .filter(v => v.isReady() && v.supportsMarket(market))
      .map(async v => {
        try {
          return await v.getQuote(market, side, size);
        } catch (err) {
          logger.warn({ venue: v.name, err }, 'Venue quote failed');
          return null;
        }
      });

    const venueResults = await Promise.all(venuePromises);
    for (const q of venueResults) {
      if (q) quotes.push(q);
    }

    return quotes;
  }

  /**
   * Get a quote for how an order would be routed (no execution).
   */
  getQuote(market: string, side: Side, size: string): SORQuote {
    const sizeBN = new BigNumber(size);

    // Check internal book
    const internalBook = this.engine.getBook(market, 50);
    const internalResult = internalBook
      ? this.simulateInternalFill(internalBook, side, sizeBN)
      : { avgPrice: null, availableSize: '0' };

    // Check external book
    const hlCoin = MARKET_TO_HL_COIN[market];
    const externalResult = hlCoin
      ? this.simulateExternalFill(hlCoin, side, sizeBN)
      : { avgPrice: null, availableSize: '0' };

    // Determine best route
    const intAvail = new BigNumber(internalResult.availableSize);
    const extAvail = new BigNumber(externalResult.availableSize);
    const intPrice = internalResult.avgPrice ? new BigNumber(internalResult.avgPrice) : null;
    const extPrice = externalResult.avgPrice ? new BigNumber(externalResult.avgPrice) : null;

    let bestRoute: 'internal' | 'external' | 'split';
    let estimatedAvgPrice: BigNumber;

    if (intAvail.gte(sizeBN) && intPrice) {
      // Internal can fill entirely
      if (extPrice) {
        const isBuy = side === Side.Buy;
        const internalBetter = isBuy ? intPrice.lte(extPrice) : intPrice.gte(extPrice);
        if (internalBetter) {
          bestRoute = 'internal';
          estimatedAvgPrice = intPrice;
        } else {
          // External is better — only switch if it can fill the full order
          // AND the improvement exceeds MIN_SPLIT_IMPROVEMENT_BPS
          if (extAvail.gte(sizeBN)) {
            const improvementBps = isBuy
              ? intPrice.minus(extPrice).div(intPrice).times(10000)
              : extPrice.minus(intPrice).div(intPrice).times(10000);
            if (improvementBps.gte(MIN_SPLIT_IMPROVEMENT_BPS)) {
              bestRoute = 'external';
              estimatedAvgPrice = extPrice;
            } else {
              bestRoute = 'internal';
              estimatedAvgPrice = intPrice;
            }
          } else {
            // External can't fill the full order; internal can — stay internal
            bestRoute = 'internal';
            estimatedAvgPrice = intPrice;
          }
        }
      } else {
        bestRoute = 'internal';
        estimatedAvgPrice = intPrice;
      }
    } else if (extAvail.gte(sizeBN) && extPrice) {
      if (intAvail.gt(0) && intPrice) {
        // Partial internal + rest external
        bestRoute = 'split';
        const intNotional = intPrice.times(intAvail);
        const extRemainder = sizeBN.minus(intAvail);
        const extNotional = extPrice.times(extRemainder);
        estimatedAvgPrice = intNotional.plus(extNotional).div(sizeBN);
      } else {
        bestRoute = 'external';
        estimatedAvgPrice = extPrice;
      }
    } else if (intAvail.plus(extAvail).gte(sizeBN)) {
      bestRoute = 'split';
      const intFillSize = BigNumber.min(intAvail, sizeBN);
      const extFillSize = sizeBN.minus(intFillSize);
      const intNot = intPrice ? intPrice.times(intFillSize) : new BigNumber(0);
      const extNot = extPrice ? extPrice.times(extFillSize) : new BigNumber(0);
      estimatedAvgPrice = intNot.plus(extNot).div(sizeBN);
    } else {
      // Not enough liquidity anywhere
      bestRoute = intAvail.gte(extAvail) ? 'internal' : 'external';
      estimatedAvgPrice = intPrice || extPrice || new BigNumber(0);
    }

    const estimatedFee = estimatedAvgPrice.times(sizeBN).times('0.0005'); // 5bps fee estimate

    return {
      market,
      side,
      size,
      internalAvgPrice: internalResult.avgPrice,
      internalAvailableSize: internalResult.availableSize,
      externalAvgPrice: externalResult.avgPrice,
      externalAvailableSize: externalResult.availableSize,
      bestRoute,
      estimatedAvgPrice: estimatedAvgPrice.decimalPlaces(6).toString(),
      estimatedFee: estimatedFee.decimalPlaces(6).toString(),
    };
  }

  /**
   * Execute a smart-routed order.
   * Returns combined results from internal and external fills.
   */
  async executeOrder(
    userId: string,
    market: string,
    side: Side,
    size: string,
    orderId?: string,
  ): Promise<SORResult> {
    const quote = this.getQuote(market, side, size);
    const sizeBN = new BigNumber(size);

    logger.info({
      userId,
      market,
      side,
      size,
      bestRoute: quote.bestRoute,
      internalAvail: quote.internalAvailableSize,
      externalAvail: quote.externalAvailableSize,
    }, 'SOR executing order');

    const internalFills: Trade[] = [];
    const externalFills: Array<ExternalFill | VenueFill> = [];
    let totalFilledSize = new BigNumber(0);
    let totalNotional = new BigNumber(0);
    let totalFees = new BigNumber(0);

    // Step 1: Fill internally what we can
    if (quote.bestRoute === 'internal' || quote.bestRoute === 'split') {
      const internalSize = quote.bestRoute === 'internal'
        ? size
        : BigNumber.min(sizeBN, new BigNumber(quote.internalAvailableSize)).toString();

      if (new BigNumber(internalSize).gt(0)) {
        const result = this.engine.submitOrder({
          userId,
          market,
          side,
          type: OrderType.Market,
          price: '0', // Market orders don't need price
          size: internalSize,
        });

        internalFills.push(...result.internalTrades);
        for (const trade of result.internalTrades) {
          const tradeSize = new BigNumber(trade.size);
          const tradePrice = new BigNumber(trade.price);
          totalFilledSize = totalFilledSize.plus(tradeSize);
          totalNotional = totalNotional.plus(tradePrice.times(tradeSize));
          totalFees = totalFees.plus(new BigNumber(trade.takerFee));
        }
      }
    }

    // Step 2: Route remainder to external venues (best price first)
    let remainder = sizeBN.minus(totalFilledSize);
    const venueBreakdown: { venue: string; size: string; avgPrice: string }[] = [];

    if (remainder.gt(0) && (quote.bestRoute === 'external' || quote.bestRoute === 'split')) {
      // Get quotes from all venues and sort by price (best first)
      const venueQuotes = await this.getVenueQuotes(market, side, remainder.toString());
      const sorted = venueQuotes
        .filter(q => new BigNumber(q.availableSize).gt(0))
        .sort((a, b) => {
          const priceA = new BigNumber(a.avgPrice);
          const priceB = new BigNumber(b.avgPrice);
          // Effective price = price + fees/size
          const effA = priceA.plus(new BigNumber(a.fee).div(a.availableSize));
          const effB = priceB.plus(new BigNumber(b.fee).div(b.availableSize));
          // Buy: prefer lower price. Sell: prefer higher price.
          return side === Side.Buy ? effA.minus(effB).toNumber() : effB.minus(effA).toNumber();
        });

      // Fill across venues in price order
      for (const vq of sorted) {
        if (remainder.lte(0)) break;

        const fillSize = BigNumber.min(remainder, new BigNumber(vq.availableSize));

        if (vq.venue === 'hyperliquid') {
          // Use legacy Hyperliquid router
          const externalFill = await this.hlRouter.routeOrder({
            market,
            side,
            size: fillSize.toString(),
            userId,
            orderId: orderId || `sor-${Date.now()}`,
          });

          if (externalFill) {
            externalFills.push(externalFill);
            const fSize = new BigNumber(externalFill.size);
            const fPrice = new BigNumber(externalFill.price);
            totalFilledSize = totalFilledSize.plus(fSize);
            totalNotional = totalNotional.plus(fPrice.times(fSize));
            totalFees = totalFees.plus(new BigNumber(externalFill.fee));
            remainder = remainder.minus(fSize);
            venueBreakdown.push({ venue: 'hyperliquid', size: fSize.toString(), avgPrice: fPrice.toString() });
          }
        } else {
          // Use ExternalVenue interface
          const venue = this.externalVenues.find(v => v.name === vq.venue);
          if (venue) {
            const venueFill = await venue.route(
              market, side, fillSize.toString(), userId, orderId || `sor-${Date.now()}`
            );
            if (venueFill) {
              externalFills.push(venueFill);
              const fSize = new BigNumber(venueFill.size);
              const fPrice = new BigNumber(venueFill.price);
              totalFilledSize = totalFilledSize.plus(fSize);
              totalNotional = totalNotional.plus(fPrice.times(fSize));
              totalFees = totalFees.plus(new BigNumber(venueFill.fee));
              remainder = remainder.minus(fSize);
              venueBreakdown.push({ venue: vq.venue, size: fSize.toString(), avgPrice: fPrice.toString() });
            }
          }
        }
      }
    }

    const avgPrice = totalFilledSize.gt(0)
      ? totalNotional.div(totalFilledSize)
      : new BigNumber(0);

    const internalFilledSize = internalFills.reduce(
      (sum, t) => sum.plus(t.size),
      new BigNumber(0),
    );
    const externalFilledSize = externalFills.reduce(
      (sum, f) => sum.plus(f.size),
      new BigNumber(0),
    );

    if (internalFilledSize.gt(0)) {
      const intNotional = internalFills.reduce(
        (sum, t) => sum.plus(new BigNumber(t.price).times(t.size)), new BigNumber(0));
      venueBreakdown.unshift({
        venue: 'internal',
        size: internalFilledSize.toString(),
        avgPrice: intNotional.div(internalFilledSize).toString(),
      });
    }

    const result: SORResult = {
      internalFills,
      externalFills,
      totalFilledSize: totalFilledSize.toString(),
      avgPrice: avgPrice.decimalPlaces(6).toString(),
      totalFees: totalFees.decimalPlaces(6).toString(),
      splitRatio: {
        internal: internalFilledSize.toString(),
        external: externalFilledSize.toString(),
      },
      venueBreakdown,
    };

    logger.info({
      userId,
      market,
      totalFilled: result.totalFilledSize,
      avgPrice: result.avgPrice,
      internalSize: result.splitRatio.internal,
      externalSize: result.splitRatio.external,
    }, 'SOR execution complete');

    return result;
  }

  /**
   * Simulate filling against internal book (no execution).
   */
  private simulateInternalFill(
    book: { bids: L2Level[]; asks: L2Level[] },
    side: Side,
    size: BigNumber,
  ): { avgPrice: string | null; availableSize: string } {
    // Buy fills against asks, sell fills against bids
    const levels = side === Side.Buy ? book.asks : book.bids;
    if (!levels || levels.length === 0) return { avgPrice: null, availableSize: '0' };

    let remaining = size;
    let totalCost = new BigNumber(0);
    let totalFilled = new BigNumber(0);

    for (const level of levels) {
      if (remaining.lte(0)) break;
      const levelSize = new BigNumber(level.size);
      const levelPrice = new BigNumber(level.price);
      const fillSize = BigNumber.min(remaining, levelSize);

      totalCost = totalCost.plus(levelPrice.times(fillSize));
      totalFilled = totalFilled.plus(fillSize);
      remaining = remaining.minus(fillSize);
    }

    const avgPrice = totalFilled.gt(0)
      ? totalCost.div(totalFilled).decimalPlaces(6).toString()
      : null;

    return { avgPrice, availableSize: totalFilled.toString() };
  }

  /**
   * Simulate filling against Hyperliquid book (no execution).
   */
  private simulateExternalFill(
    hlCoin: string,
    side: Side,
    size: BigNumber,
  ): { avgPrice: string | null; availableSize: string } {
    const book = this.hlFeed.getBook(hlCoin);
    if (!book || !book.levels) return { avgPrice: null, availableSize: '0' };

    // Buy fills against asks, sell fills against bids
    const levels = side === Side.Buy ? book.levels[1] : book.levels[0];
    if (!levels || levels.length === 0) return { avgPrice: null, availableSize: '0' };

    let remaining = size;
    let totalCost = new BigNumber(0);
    let totalFilled = new BigNumber(0);

    for (const level of levels) {
      if (remaining.lte(0)) break;
      const levelSize = new BigNumber(level.sz);
      const levelPrice = new BigNumber(level.px);
      const fillSize = BigNumber.min(remaining, levelSize);

      totalCost = totalCost.plus(levelPrice.times(fillSize));
      totalFilled = totalFilled.plus(fillSize);
      remaining = remaining.minus(fillSize);
    }

    const avgPrice = totalFilled.gt(0)
      ? totalCost.div(totalFilled).decimalPlaces(6).toString()
      : null;

    return { avgPrice, availableSize: totalFilled.toString() };
  }
}
