// ============================================================
// GoodPredict CLOB Matching Engine
// ============================================================
// In-memory order book with price-time priority matching.
// Each market has two books (YES and NO).
// Supports complementary matching: BUY YES @ 0.60 matches BUY NO @ 0.40.

import { v4 as uuid } from 'uuid';
import type { Order, OrderBookLevel, OrderBookSnapshot, OutcomeToken, Side, Trade } from '../types/index.js';

/**
 * A single-sided order book (bids or asks for one token).
 * Bids sorted by price descending (highest first).
 * Asks sorted by price ascending (lowest first).
 */
class PriceLevelQueue {
  private levels: Map<number, Order[]> = new Map();
  private sortedPrices: number[] = [];
  private readonly ascending: boolean;

  constructor(ascending: boolean) {
    this.ascending = ascending;
  }

  add(order: Order): void {
    const price = order.price;
    if (!this.levels.has(price)) {
      this.levels.set(price, []);
      this.sortedPrices.push(price);
      this.sortedPrices.sort((a, b) => this.ascending ? a - b : b - a);
    }
    this.levels.get(price)!.push(order);
  }

  remove(orderId: string): Order | undefined {
    for (const [price, orders] of this.levels) {
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        const [removed] = orders.splice(idx, 1);
        if (orders.length === 0) {
          this.levels.delete(price);
          this.sortedPrices = this.sortedPrices.filter(p => p !== price);
        }
        return removed;
      }
    }
    return undefined;
  }

  bestPrice(): number | undefined {
    return this.sortedPrices[0];
  }

  bestOrders(): Order[] {
    const best = this.bestPrice();
    if (best === undefined) return [];
    return this.levels.get(best) || [];
  }

  peekBest(): Order | undefined {
    const orders = this.bestOrders();
    return orders[0];
  }

  isEmpty(): boolean {
    return this.sortedPrices.length === 0;
  }

  getLevels(): OrderBookLevel[] {
    return this.sortedPrices.map(price => {
      const orders = this.levels.get(price) || [];
      const size = orders.reduce((sum, o) => sum + (o.size - o.filledSize), 0);
      return { price, size, orders: orders.length };
    });
  }

  /** Get all orders (for iteration) */
  allOrders(): Order[] {
    const result: Order[] = [];
    for (const price of this.sortedPrices) {
      result.push(...(this.levels.get(price) || []));
    }
    return result;
  }
}

/**
 * Order book for a single market token (YES or NO).
 */
class TokenOrderBook {
  readonly marketId: string;
  readonly token: OutcomeToken;
  readonly bids: PriceLevelQueue; // Buy orders (highest first)
  readonly asks: PriceLevelQueue; // Sell orders (lowest first)

  constructor(marketId: string, token: OutcomeToken) {
    this.marketId = marketId;
    this.token = token;
    this.bids = new PriceLevelQueue(false); // descending
    this.asks = new PriceLevelQueue(true);  // ascending
  }

  getSnapshot(): OrderBookSnapshot {
    const bids = this.bids.getLevels();
    const asks = this.asks.getLevels();
    const bestBid = this.bids.bestPrice() ?? 0;
    const bestAsk = this.asks.bestPrice() ?? 1;
    const midpoint = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;

    return {
      marketId: this.marketId,
      token: this.token,
      bids,
      asks,
      midpoint,
      spread,
      timestamp: Date.now(),
    };
  }
}

// ============================================================
// Market Order Book Manager
// ============================================================

export interface MatchResult {
  trades: Trade[];
  remainingOrder: Order | null; // null if fully filled
}

export type TradeCallback = (trade: Trade) => void;
export type OrderUpdateCallback = (order: Order) => void;

export class OrderBookEngine {
  private books: Map<string, { yes: TokenOrderBook; no: TokenOrderBook }> = new Map();
  private orders: Map<string, Order> = new Map();
  private onTrade?: TradeCallback;
  private onOrderUpdate?: OrderUpdateCallback;

  constructor(opts?: { onTrade?: TradeCallback; onOrderUpdate?: OrderUpdateCallback }) {
    this.onTrade = opts?.onTrade;
    this.onOrderUpdate = opts?.onOrderUpdate;
  }

  /** Initialize order books for a market */
  initMarket(marketId: string): void {
    if (this.books.has(marketId)) return;
    this.books.set(marketId, {
      yes: new TokenOrderBook(marketId, 'YES'),
      no: new TokenOrderBook(marketId, 'NO'),
    });
  }

  /** Place a new order into the book */
  placeOrder(params: {
    marketId: string;
    token: OutcomeToken;
    side: Side;
    price: number;
    size: number;
    maker: string;
    type?: 'GTC' | 'FOK' | 'FAK';
    expiration?: number;
  }): MatchResult {
    const { marketId, token, side, price, size, maker, type = 'GTC', expiration } = params;

    // Validate
    if (price <= 0 || price >= 1) throw new Error('Price must be between 0 and 1 exclusive');
    if (size <= 0) throw new Error('Size must be positive');

    this.initMarket(marketId);

    const order: Order = {
      id: uuid(),
      marketId,
      token,
      side,
      price: Math.round(price * 100) / 100, // Round to 2 decimal places (tick size 0.01)
      size,
      filledSize: 0,
      status: 'OPEN',
      type,
      maker,
      expiration,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Try to match
    const trades = this.matchOrder(order);

    // Handle order types
    const remaining = order.size - order.filledSize;
    if (remaining > 0) {
      if (type === 'FOK') {
        // Fill or Kill: if not fully filled, cancel everything
        if (order.filledSize > 0) {
          // Undo trades (in production, would revert)
          order.status = 'CANCELLED';
          this.onOrderUpdate?.(order);
          return { trades: [], remainingOrder: null };
        }
        order.status = 'CANCELLED';
        this.onOrderUpdate?.(order);
        return { trades: [], remainingOrder: null };
      }

      if (type === 'FAK') {
        // Fill and Kill: keep what's filled, cancel the rest
        order.status = order.filledSize > 0 ? 'PARTIALLY_FILLED' : 'CANCELLED';
        this.onOrderUpdate?.(order);
        return { trades, remainingOrder: null };
      }

      // GTC: rest on book
      this.addToBook(order);
      this.orders.set(order.id, order);
      this.onOrderUpdate?.(order);
    } else {
      order.status = 'FILLED';
      this.onOrderUpdate?.(order);
    }

    return {
      trades,
      remainingOrder: remaining > 0 ? order : null,
    };
  }

  /** Cancel an order by ID */
  cancelOrder(orderId: string): Order | undefined {
    const order = this.orders.get(orderId);
    if (!order || order.status === 'FILLED' || order.status === 'CANCELLED') {
      return undefined;
    }

    const books = this.books.get(order.marketId);
    if (!books) return undefined;

    const book = order.token === 'YES' ? books.yes : books.no;
    const queue = order.side === 'BUY' ? book.bids : book.asks;
    queue.remove(orderId);

    order.status = 'CANCELLED';
    order.updatedAt = Date.now();
    this.orders.delete(orderId);
    this.onOrderUpdate?.(order);

    return order;
  }

  /** Get order book snapshot for a market token */
  getOrderBook(marketId: string, token: OutcomeToken): OrderBookSnapshot | undefined {
    const books = this.books.get(marketId);
    if (!books) return undefined;
    const book = token === 'YES' ? books.yes : books.no;
    return book.getSnapshot();
  }

  /** Get midpoint price */
  getMidpoint(marketId: string, token: OutcomeToken): number | undefined {
    const snap = this.getOrderBook(marketId, token);
    if (!snap) return undefined;
    if (snap.bids.length === 0 && snap.asks.length === 0) return undefined;
    return snap.midpoint;
  }

  /** Get an order by ID */
  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  /** Get all open orders for a maker */
  getOrdersByMaker(maker: string): Order[] {
    return Array.from(this.orders.values()).filter(o => o.maker === maker);
  }

  // ============================================================
  // Private matching logic
  // ============================================================

  private matchOrder(incomingOrder: Order): Trade[] {
    const trades: Trade[] = [];
    const books = this.books.get(incomingOrder.marketId)!;
    const book = incomingOrder.token === 'YES' ? books.yes : books.no;

    // Direct matching: BUY matches against ASK, SELL matches against BID
    const oppositeQueue = incomingOrder.side === 'BUY' ? book.asks : book.bids;

    while (incomingOrder.filledSize < incomingOrder.size && !oppositeQueue.isEmpty()) {
      const bestResting = oppositeQueue.peekBest()!;

      // Check if prices cross
      const pricesCross = incomingOrder.side === 'BUY'
        ? incomingOrder.price >= bestResting.price
        : incomingOrder.price <= bestResting.price;

      if (!pricesCross) break;

      // Execute at resting order's price (price improvement for taker)
      const fillPrice = bestResting.price;
      const fillSize = Math.min(
        incomingOrder.size - incomingOrder.filledSize,
        bestResting.size - bestResting.filledSize,
      );

      // Create trade
      const trade: Trade = {
        id: uuid(),
        marketId: incomingOrder.marketId,
        token: incomingOrder.token,
        makerOrderId: bestResting.id,
        takerOrderId: incomingOrder.id,
        price: fillPrice,
        size: fillSize,
        maker: bestResting.maker,
        taker: incomingOrder.maker,
        status: 'MATCHED',
        createdAt: Date.now(),
      };
      trades.push(trade);
      this.onTrade?.(trade);

      // Update fill sizes
      incomingOrder.filledSize += fillSize;
      bestResting.filledSize += fillSize;
      incomingOrder.updatedAt = Date.now();
      bestResting.updatedAt = Date.now();

      // If resting order fully filled, remove from book
      if (bestResting.filledSize >= bestResting.size) {
        oppositeQueue.remove(bestResting.id);
        bestResting.status = 'FILLED';
        this.orders.delete(bestResting.id);
        this.onOrderUpdate?.(bestResting);
      } else {
        bestResting.status = 'PARTIALLY_FILLED';
        this.onOrderUpdate?.(bestResting);
      }
    }

    // Complementary matching: BUY YES @ 0.60 can match with BUY NO @ 0.40+
    // (Because YES + NO = $1, so someone buying NO at 0.40 is effectively selling YES at 0.60)
    if (incomingOrder.filledSize < incomingOrder.size && incomingOrder.side === 'BUY') {
      const complementaryBook = incomingOrder.token === 'YES' ? books.no : books.yes;
      const complementaryBids = complementaryBook.bids;

      while (incomingOrder.filledSize < incomingOrder.size && !complementaryBids.isEmpty()) {
        const bestComplement = complementaryBids.peekBest()!;

        // Check if complementary prices sum to >= $1
        // BUY YES @ 0.60 + BUY NO @ 0.40 = $1.00 → match
        if (incomingOrder.price + bestComplement.price < 1.0) break;

        // Fill price: incoming gets their price, complement gets their price
        // The "surplus" (if sum > $1) goes as price improvement
        const fillSize = Math.min(
          incomingOrder.size - incomingOrder.filledSize,
          bestComplement.size - bestComplement.filledSize,
        );

        const trade: Trade = {
          id: uuid(),
          marketId: incomingOrder.marketId,
          token: incomingOrder.token,
          makerOrderId: bestComplement.id,
          takerOrderId: incomingOrder.id,
          price: incomingOrder.price, // Each side pays their price
          size: fillSize,
          maker: bestComplement.maker,
          taker: incomingOrder.maker,
          status: 'MATCHED',
          createdAt: Date.now(),
        };
        trades.push(trade);
        this.onTrade?.(trade);

        incomingOrder.filledSize += fillSize;
        bestComplement.filledSize += fillSize;
        incomingOrder.updatedAt = Date.now();
        bestComplement.updatedAt = Date.now();

        if (bestComplement.filledSize >= bestComplement.size) {
          complementaryBids.remove(bestComplement.id);
          bestComplement.status = 'FILLED';
          this.orders.delete(bestComplement.id);
          this.onOrderUpdate?.(bestComplement);
        } else {
          bestComplement.status = 'PARTIALLY_FILLED';
          this.onOrderUpdate?.(bestComplement);
        }
      }
    }

    // Update incoming order status
    if (incomingOrder.filledSize > 0 && incomingOrder.filledSize < incomingOrder.size) {
      incomingOrder.status = 'PARTIALLY_FILLED';
    } else if (incomingOrder.filledSize >= incomingOrder.size) {
      incomingOrder.status = 'FILLED';
    }

    return trades;
  }

  private addToBook(order: Order): void {
    const books = this.books.get(order.marketId)!;
    const book = order.token === 'YES' ? books.yes : books.no;
    const queue = order.side === 'BUY' ? book.bids : book.asks;
    queue.add(order);
  }
}
