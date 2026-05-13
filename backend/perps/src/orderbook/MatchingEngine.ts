/**
 * GoodPerps Matching Engine
 *
 * Manages multiple order books and coordinates trade settlement.
 * Handles external routing to Hyperliquid when internal liquidity is thin.
 */

import { EventEmitter } from 'events';
import BigNumber from 'bignumber.js';
import { OrderBook } from './OrderBook';
import {
  Order,
  Trade,
  Side,
  OrderType,
  TimeInForce,
  MarketConfig,
  L2Book,
} from './types';
import pino from 'pino';

const logger = pino({ name: 'matching-engine' });

export interface MatchResult {
  order: Order;
  internalTrades: Trade[];
  externalRouted: boolean;
  externalSize?: string;
}

export interface SettlementBatch {
  id: string;
  trades: Trade[];
  timestamp: number;
  totalVolume: string;
  totalFees: string;
}

export class MatchingEngine extends EventEmitter {
  private books: Map<string, OrderBook> = new Map();
  private pendingSettlement: Trade[] = [];
  private settlementInterval: NodeJS.Timeout | null = null;
  private tradeHistory: Trade[] = [];
  private readonly maxTradeHistory = 10000;

  // Settlement batching config
  private readonly SETTLEMENT_INTERVAL_MS = 2000; // Batch every 2 seconds
  private readonly MIN_BATCH_SIZE = 1;

  constructor() {
    super();
  }

  /**
   * Initialize a new market.
   */
  addMarket(config: MarketConfig): void {
    if (this.books.has(config.symbol)) {
      throw new Error(`Market ${config.symbol} already exists`);
    }
    const book = new OrderBook(config);
    this.books.set(config.symbol, book);
    logger.info({ market: config.symbol }, 'Market added');
  }

  /**
   * Start the settlement batching loop.
   */
  start(): void {
    this.settlementInterval = setInterval(() => {
      this.flushSettlement();
    }, this.SETTLEMENT_INTERVAL_MS);
    logger.info('Matching engine started');
  }

  /**
   * Stop the engine.
   */
  stop(): void {
    if (this.settlementInterval) {
      clearInterval(this.settlementInterval);
      this.settlementInterval = null;
    }
    // Flush remaining trades
    this.flushSettlement();
    logger.info('Matching engine stopped');
  }

  /**
   * Submit a new order.
   */
  submitOrder(params: {
    userId: string;
    market: string;
    side: Side;
    type: OrderType;
    price: string;
    size: string;
    timeInForce?: TimeInForce;
    reduceOnly?: boolean;
    clientId?: string;
  }): MatchResult {
    const book = this.books.get(params.market);
    if (!book) throw new Error(`Unknown market: ${params.market}`);

    const { order, trades } = book.placeOrder({
      userId: params.userId,
      side: params.side,
      type: params.type,
      price: params.price,
      size: params.size,
      timeInForce: params.timeInForce,
      reduceOnly: params.reduceOnly,
      clientId: params.clientId,
    });

    // Add trades to settlement queue
    if (trades.length > 0) {
      this.pendingSettlement.push(...trades);
      this.tradeHistory.push(...trades);
      // Trim history
      if (this.tradeHistory.length > this.maxTradeHistory) {
        this.tradeHistory = this.tradeHistory.slice(-this.maxTradeHistory);
      }
    }

    // Emit events
    this.emit('order', order);
    for (const trade of trades) {
      this.emit('trade', trade);
    }
    this.emit('bookUpdate', book.getL2Book());

    // Check if order needs external routing
    const remaining = new BigNumber(order.remainingSize);
    let externalRouted = false;
    if (remaining.gt(0) && params.type === OrderType.Market) {
      // Market order with remaining size → route to external venue
      externalRouted = true;
      this.emit('routeExternal', {
        market: params.market,
        side: params.side,
        size: remaining.toString(),
        userId: params.userId,
        orderId: order.id,
      });
      logger.info({
        orderId: order.id,
        market: params.market,
        remainingSize: remaining.toString(),
      }, 'Routing remaining size to external venue');
    }

    return {
      order,
      internalTrades: trades,
      externalRouted,
      externalSize: externalRouted ? remaining.toString() : undefined,
    };
  }

  /**
   * Cancel an order.
   */
  cancelOrder(market: string, orderId: string, userId: string): Order | null {
    const book = this.books.get(market);
    if (!book) return null;

    const order = book.cancelOrder(orderId, userId);
    if (order) {
      this.emit('order', order);
      this.emit('bookUpdate', book.getL2Book());
    }
    return order;
  }

  /**
   * Get order book snapshot.
   */
  getBook(market: string, depth?: number): L2Book | null {
    const book = this.books.get(market);
    return book?.getL2Book(depth) ?? null;
  }

  /**
   * Get BBO for a market.
   */
  getBBO(market: string) {
    const book = this.books.get(market);
    return book?.getBBO() ?? null;
  }

  /**
   * Get recent trades for a market.
   */
  getRecentTrades(market: string, limit: number = 50): Trade[] {
    return this.tradeHistory
      .filter(t => t.market === market)
      .slice(-limit);
  }

  /**
   * Get user's open orders.
   */
  getUserOrders(userId: string, market?: string): Order[] {
    if (market) {
      const book = this.books.get(market);
      return book?.getUserOrders(userId) ?? [];
    }
    const allOrders: Order[] = [];
    for (const book of this.books.values()) {
      allOrders.push(...book.getUserOrders(userId));
    }
    return allOrders;
  }

  /**
   * Get all active markets.
   */
  getMarkets(): string[] {
    return Array.from(this.books.keys());
  }

  /**
   * Get market config.
   */
  getMarketConfig(market: string): MarketConfig | undefined {
    return this.books.get(market)?.config;
  }

  // --- Private ---

  private flushSettlement(): void {
    if (this.pendingSettlement.length < this.MIN_BATCH_SIZE) return;

    const trades = [...this.pendingSettlement];
    this.pendingSettlement = [];

    const totalVolume = trades.reduce(
      (sum, t) => sum.plus(new BigNumber(t.price).times(t.size)),
      new BigNumber(0)
    );

    const totalFees = trades.reduce(
      (sum, t) => sum.plus(new BigNumber(t.makerFee).abs()).plus(new BigNumber(t.takerFee)),
      new BigNumber(0)
    );

    const batch: SettlementBatch = {
      id: `batch-${Date.now()}`,
      trades,
      timestamp: Date.now(),
      totalVolume: totalVolume.toString(),
      totalFees: totalFees.toString(),
    };

    logger.info({
      batchId: batch.id,
      tradeCount: trades.length,
      volume: batch.totalVolume,
      fees: batch.totalFees,
    }, 'Settlement batch ready');

    this.emit('settlement', batch);
  }
}
