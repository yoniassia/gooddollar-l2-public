/**
 * GoodPerps Order Book Engine
 *
 * In-memory Central Limit Order Book (CLOB) with price-time priority.
 * Inspired by Hyperliquid's on-chain book and dYdX's off-chain matching.
 */

import BigNumber from 'bignumber.js';
import { v4 as uuidv4 } from 'uuid';
import {
  Order,
  Trade,
  Side,
  OrderType,
  OrderStatus,
  TimeInForce,
  L2Level,
  L2Book,
  MarketConfig,
} from './types';

// Configure BigNumber for financial precision
BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN });

interface PriceLevel {
  price: BigNumber;
  orders: Order[];
  totalSize: BigNumber;
}

export class OrderBook {
  private bids: Map<string, PriceLevel> = new Map(); // price string → level
  private asks: Map<string, PriceLevel> = new Map();
  private sortedBidPrices: string[] = [];  // Descending (best bid first)
  private sortedAskPrices: string[] = [];  // Ascending (best ask first)
  private ordersById: Map<string, Order> = new Map();
  private ordersByUser: Map<string, Set<string>> = new Map();

  public readonly market: string;
  public readonly config: MarketConfig;
  private tradeSequence = 0;

  constructor(config: MarketConfig) {
    this.market = config.symbol;
    this.config = config;
  }

  /**
   * Place a new order. Returns the order and any resulting trades.
   */
  placeOrder(params: {
    userId: string;
    side: Side;
    type: OrderType;
    price: string;
    size: string;
    timeInForce?: TimeInForce;
    reduceOnly?: boolean;
    clientId?: string;
    triggerPrice?: string;
  }): { order: Order; trades: Trade[] } {
    const now = Date.now();
    const order: Order = {
      id: uuidv4(),
      clientId: params.clientId,
      market: this.market,
      side: params.side,
      type: params.type,
      price: params.price,
      size: params.size,
      filledSize: '0',
      remainingSize: params.size,
      status: OrderStatus.New,
      timeInForce: params.timeInForce ?? TimeInForce.GTC,
      reduceOnly: params.reduceOnly ?? false,
      postOnly: params.timeInForce === TimeInForce.PostOnly,
      triggerPrice: params.triggerPrice,
      userId: params.userId,
      timestamp: now,
      updatedAt: now,
    };

    // Validate order
    this.validateOrder(order);

    // For market orders, set aggressive price
    if (order.type === OrderType.Market) {
      order.price = order.side === Side.Buy ? '999999999' : '0.000001';
      order.timeInForce = TimeInForce.IOC;
    }

    // PostOnly: check before any matching so we never disturb resting orders.
    // If the order would immediately cross, reject without touching the book.
    if (order.timeInForce === TimeInForce.PostOnly) {
      const isBuy = order.side === Side.Buy;
      const oppPrices = isBuy ? this.sortedAskPrices : this.sortedBidPrices;
      if (oppPrices.length > 0) {
        const bestOpp = new BigNumber(oppPrices[0]);
        const wouldCross = isBuy ? bestOpp.lte(order.price) : bestOpp.gte(order.price);
        if (wouldCross) {
          order.status = OrderStatus.Rejected;
          return { order, trades: [] };
        }
      }
      // No cross → rest the order
      this.addToBook(order);
      return { order, trades: [] };
    }

    // Match against opposite side
    const trades = this.matchOrder(order);

    // Handle remaining size based on TIF
    if (new BigNumber(order.remainingSize).gt(0)) {
      switch (order.timeInForce) {
        case TimeInForce.IOC:
        case TimeInForce.FOK:
          // Cancel remaining
          if (order.timeInForce === TimeInForce.FOK && trades.length > 0) {
            // FOK should have been all-or-nothing — revert trades
            // (simplified: in production, check before matching)
          }
          order.status = trades.length > 0 ? OrderStatus.PartiallyFilled : OrderStatus.Canceled;
          break;

        // Note: PostOnly is handled by early return above (line ~94),
        // so it never reaches this switch.

        case TimeInForce.GTC:
        default:
          order.status = trades.length > 0 ? OrderStatus.PartiallyFilled : OrderStatus.New;
          this.addToBook(order);
          break;
      }
    } else {
      order.status = OrderStatus.Filled;
    }

    return { order, trades };
  }

  /**
   * Cancel an order by ID.
   */
  cancelOrder(orderId: string, userId: string): Order | null {
    const order = this.ordersById.get(orderId);
    if (!order || order.userId !== userId) return null;
    if (order.status === OrderStatus.Filled || order.status === OrderStatus.Canceled) return null;

    this.removeFromBook(order);
    order.status = OrderStatus.Canceled;
    order.updatedAt = Date.now();
    return order;
  }

  /**
   * Cancel all orders for a user.
   */
  cancelAllOrders(userId: string): Order[] {
    const orderIds = this.ordersByUser.get(userId);
    if (!orderIds) return [];

    const canceled: Order[] = [];
    for (const orderId of orderIds) {
      const result = this.cancelOrder(orderId, userId);
      if (result) canceled.push(result);
    }
    return canceled;
  }

  /**
   * Get L2 order book snapshot.
   */
  getL2Book(depth: number = 20): L2Book {
    const bids: L2Level[] = [];
    const asks: L2Level[] = [];

    for (let i = 0; i < Math.min(depth, this.sortedBidPrices.length); i++) {
      const level = this.bids.get(this.sortedBidPrices[i])!;
      bids.push({
        price: level.price.toString(),
        size: level.totalSize.toString(),
        orderCount: level.orders.length,
      });
    }

    for (let i = 0; i < Math.min(depth, this.sortedAskPrices.length); i++) {
      const level = this.asks.get(this.sortedAskPrices[i])!;
      asks.push({
        price: level.price.toString(),
        size: level.totalSize.toString(),
        orderCount: level.orders.length,
      });
    }

    return {
      market: this.market,
      bids,
      asks,
      timestamp: Date.now(),
    };
  }

  /**
   * Get best bid and ask.
   */
  getBBO(): { bestBid: string | null; bestAsk: string | null; spread: string | null } {
    const bestBid = this.sortedBidPrices[0] ?? null;
    const bestAsk = this.sortedAskPrices[0] ?? null;
    const spread = bestBid && bestAsk
      ? new BigNumber(bestAsk).minus(bestBid).toString()
      : null;
    return { bestBid, bestAsk, spread };
  }

  /**
   * Get mid price.
   */
  getMidPrice(): string | null {
    const { bestBid, bestAsk } = this.getBBO();
    if (!bestBid || !bestAsk) return null;
    return new BigNumber(bestBid).plus(bestAsk).div(2).toString();
  }

  /**
   * Get a user's open orders.
   */
  getUserOrders(userId: string): Order[] {
    const orderIds = this.ordersByUser.get(userId);
    if (!orderIds) return [];
    return Array.from(orderIds)
      .map(id => this.ordersById.get(id)!)
      .filter(o => o && (o.status === OrderStatus.New || o.status === OrderStatus.PartiallyFilled));
  }

  // --- Private Methods ---

  private validateOrder(order: Order): void {
    const size = new BigNumber(order.size);
    const price = new BigNumber(order.price);

    if (size.lte(0)) throw new Error('Order size must be positive');
    if (order.type === OrderType.Limit && price.lte(0)) throw new Error('Limit price must be positive');
    if (size.lt(this.config.minOrderSize)) throw new Error(`Min order size: ${this.config.minOrderSize}`);
    if (size.gt(this.config.maxOrderSize)) throw new Error(`Max order size: ${this.config.maxOrderSize}`);

    // Check tick size
    const tickSize = new BigNumber(this.config.tickSize);
    if (!price.mod(tickSize).eq(0) && order.type === OrderType.Limit) {
      throw new Error(`Price must be multiple of tick size: ${this.config.tickSize}`);
    }

    // Check lot size
    const lotSize = new BigNumber(this.config.lotSize);
    if (!size.mod(lotSize).eq(0)) {
      throw new Error(`Size must be multiple of lot size: ${this.config.lotSize}`);
    }
  }

  private matchOrder(takerOrder: Order): Trade[] {
    const trades: Trade[] = [];
    const isBuy = takerOrder.side === Side.Buy;
    const book = isBuy ? this.asks : this.bids;
    const sortedPrices = isBuy ? this.sortedAskPrices : this.sortedBidPrices;

    const takerRemaining = new BigNumber(takerOrder.remainingSize);
    let filled = new BigNumber(0);

    const pricesToRemove: string[] = [];

    for (let i = 0; i < sortedPrices.length && filled.lt(takerRemaining); i++) {
      const priceStr = sortedPrices[i];
      const level = book.get(priceStr)!;

      // Check if price crosses
      const takerPrice = new BigNumber(takerOrder.price);
      if (isBuy && level.price.gt(takerPrice)) break;
      if (!isBuy && level.price.lt(takerPrice)) break;

      // Self-trade prevention
      const ordersToRemove: number[] = [];

      for (let j = 0; j < level.orders.length && filled.lt(takerRemaining); j++) {
        const makerOrder = level.orders[j];

        // Skip self-trades
        if (makerOrder.userId === takerOrder.userId) continue;

        const makerRemaining = new BigNumber(makerOrder.remainingSize);
        const tradeSize = BigNumber.min(takerRemaining.minus(filled), makerRemaining);
        const tradePrice = level.price; // Maker's price (price improvement for taker)

        // Create trade
        const trade: Trade = {
          id: `t-${++this.tradeSequence}`,
          market: this.market,
          price: tradePrice.toString(),
          size: tradeSize.toString(),
          side: takerOrder.side,
          makerOrderId: makerOrder.id,
          takerOrderId: takerOrder.id,
          makerUserId: makerOrder.userId,
          takerUserId: takerOrder.userId,
          makerFee: tradeSize.times(tradePrice).times(this.config.makerFeeRate).toString(),
          takerFee: tradeSize.times(tradePrice).times(this.config.takerFeeRate).toString(),
          timestamp: Date.now(),
        };
        trades.push(trade);

        filled = filled.plus(tradeSize);

        // Update maker order
        makerOrder.filledSize = new BigNumber(makerOrder.filledSize).plus(tradeSize).toString();
        makerOrder.remainingSize = makerRemaining.minus(tradeSize).toString();
        makerOrder.updatedAt = Date.now();

        if (new BigNumber(makerOrder.remainingSize).eq(0)) {
          makerOrder.status = OrderStatus.Filled;
          ordersToRemove.push(j);
          this.ordersById.delete(makerOrder.id);
          const userOrders = this.ordersByUser.get(makerOrder.userId);
          if (userOrders) userOrders.delete(makerOrder.id);
        } else {
          makerOrder.status = OrderStatus.PartiallyFilled;
        }
      }

      // Remove filled maker orders from level (reverse to preserve indices)
      for (let k = ordersToRemove.length - 1; k >= 0; k--) {
        level.orders.splice(ordersToRemove[k], 1);
      }

      // Recalculate level size
      level.totalSize = level.orders.reduce(
        (sum, o) => sum.plus(o.remainingSize),
        new BigNumber(0)
      );

      if (level.orders.length === 0) {
        pricesToRemove.push(priceStr);
      }
    }

    // Clean up empty price levels
    for (const priceStr of pricesToRemove) {
      book.delete(priceStr);
      const idx = sortedPrices.indexOf(priceStr);
      if (idx >= 0) sortedPrices.splice(idx, 1);
    }

    // Update taker order
    takerOrder.filledSize = filled.toString();
    takerOrder.remainingSize = takerRemaining.minus(filled).toString();
    takerOrder.updatedAt = Date.now();

    return trades;
  }

  private addToBook(order: Order): void {
    const isBuy = order.side === Side.Buy;
    const book = isBuy ? this.bids : this.asks;
    const sortedPrices = isBuy ? this.sortedBidPrices : this.sortedAskPrices;
    const priceStr = order.price;

    let level = book.get(priceStr);
    if (!level) {
      level = {
        price: new BigNumber(priceStr),
        orders: [],
        totalSize: new BigNumber(0),
      };
      book.set(priceStr, level);

      // Insert into sorted array (binary search)
      const insertIdx = this.findInsertIndex(sortedPrices, priceStr, isBuy);
      sortedPrices.splice(insertIdx, 0, priceStr);
    }

    level.orders.push(order);
    level.totalSize = level.totalSize.plus(order.remainingSize);

    // Track order
    this.ordersById.set(order.id, order);
    if (!this.ordersByUser.has(order.userId)) {
      this.ordersByUser.set(order.userId, new Set());
    }
    this.ordersByUser.get(order.userId)!.add(order.id);
  }

  private removeFromBook(order: Order): void {
    const isBuy = order.side === Side.Buy;
    const book = isBuy ? this.bids : this.asks;
    const sortedPrices = isBuy ? this.sortedBidPrices : this.sortedAskPrices;
    const priceStr = order.price;

    const level = book.get(priceStr);
    if (!level) return;

    const idx = level.orders.findIndex(o => o.id === order.id);
    if (idx >= 0) {
      level.totalSize = level.totalSize.minus(order.remainingSize);
      level.orders.splice(idx, 1);
    }

    if (level.orders.length === 0) {
      book.delete(priceStr);
      const priceIdx = sortedPrices.indexOf(priceStr);
      if (priceIdx >= 0) sortedPrices.splice(priceIdx, 1);
    }

    this.ordersById.delete(order.id);
    const userOrders = this.ordersByUser.get(order.userId);
    if (userOrders) userOrders.delete(order.id);
  }

  private findInsertIndex(arr: string[], price: string, descending: boolean): number {
    const val = new BigNumber(price);
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = new BigNumber(arr[mid]);
      if (descending ? cmp.gt(val) : cmp.lt(val)) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Get total number of open orders.
   */
  get totalOrders(): number {
    return this.ordersById.size;
  }
}
