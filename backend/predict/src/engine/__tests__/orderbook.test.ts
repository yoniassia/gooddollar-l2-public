// ============================================================
// CLOB Engine Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBookEngine } from '../orderbook.js';
import type { Trade, Order } from '../../types/index.js';

describe('OrderBookEngine', () => {
  let engine: OrderBookEngine;
  const trades: Trade[] = [];
  const orderUpdates: Order[] = [];

  beforeEach(() => {
    trades.length = 0;
    orderUpdates.length = 0;
    engine = new OrderBookEngine({
      onTrade: (t) => trades.push(t),
      onOrderUpdate: (o) => orderUpdates.push({ ...o }),
    });
    engine.initMarket('test-market');
  });

  describe('Basic Order Placement', () => {
    it('should place a buy order that rests on the book', () => {
      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.50,
        size: 100,
        maker: '0xAlice',
      });

      expect(result.trades).toHaveLength(0);
      expect(result.remainingOrder).toBeDefined();
      expect(result.remainingOrder!.status).toBe('OPEN');

      const book = engine.getOrderBook('test-market', 'YES')!;
      expect(book.bids).toHaveLength(1);
      expect(book.bids[0].price).toBe(0.50);
      expect(book.bids[0].size).toBe(100);
    });

    it('should place a sell order that rests on the book', () => {
      engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'SELL',
        price: 0.60,
        size: 50,
        maker: '0xBob',
      });

      const book = engine.getOrderBook('test-market', 'YES')!;
      expect(book.asks).toHaveLength(1);
      expect(book.asks[0].price).toBe(0.60);
      expect(book.asks[0].size).toBe(50);
    });
  });

  describe('Direct Matching', () => {
    it('should match buy against resting sell', () => {
      // Alice places a sell at 0.55
      engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'SELL',
        price: 0.55,
        size: 100,
        maker: '0xAlice',
      });

      // Bob places a buy at 0.55 (matches)
      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.55,
        size: 50,
        maker: '0xBob',
      });

      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].price).toBe(0.55);
      expect(result.trades[0].size).toBe(50);
      expect(result.trades[0].maker).toBe('0xAlice');
      expect(result.trades[0].taker).toBe('0xBob');
    });

    it('should give price improvement to taker', () => {
      // Alice rests a sell at 0.50
      engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'SELL',
        price: 0.50,
        size: 100,
        maker: '0xAlice',
      });

      // Bob buys at 0.55 → should get filled at 0.50 (Alice's price)
      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.55,
        size: 100,
        maker: '0xBob',
      });

      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].price).toBe(0.50); // Price improvement!
    });

    it('should handle partial fills', () => {
      // Alice sells 50
      engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'SELL',
        price: 0.50,
        size: 50,
        maker: '0xAlice',
      });

      // Bob buys 100 → only 50 fills, 50 rests
      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.50,
        size: 100,
        maker: '0xBob',
      });

      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].size).toBe(50);
      expect(result.remainingOrder).toBeDefined();
      expect(result.remainingOrder!.filledSize).toBe(50);

      const book = engine.getOrderBook('test-market', 'YES')!;
      expect(book.bids).toHaveLength(1);
      expect(book.bids[0].size).toBe(50); // Remaining 50
    });

    it('should match against multiple resting orders', () => {
      // Alice sells 30 at 0.50
      engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'SELL', price: 0.50, size: 30, maker: '0xAlice' });
      // Charlie sells 40 at 0.51
      engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'SELL', price: 0.51, size: 40, maker: '0xCharlie' });

      // Bob buys 60 at 0.55 → fills 30@0.50 + 30@0.51
      const result = engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'BUY', price: 0.55, size: 60, maker: '0xBob' });

      expect(result.trades).toHaveLength(2);
      expect(result.trades[0].price).toBe(0.50);
      expect(result.trades[0].size).toBe(30);
      expect(result.trades[1].price).toBe(0.51);
      expect(result.trades[1].size).toBe(30);
    });
  });

  describe('Complementary Matching', () => {
    it('should match BUY YES against BUY NO when prices sum to >= 1', () => {
      // Alice wants to buy NO at 0.40
      engine.placeOrder({
        marketId: 'test-market',
        token: 'NO',
        side: 'BUY',
        price: 0.40,
        size: 100,
        maker: '0xAlice',
      });

      // Bob wants to buy YES at 0.60 → 0.60 + 0.40 = 1.00 → match!
      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.60,
        size: 100,
        maker: '0xBob',
      });

      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].size).toBe(100);
    });

    it('should NOT match when prices sum to < 1', () => {
      // Alice wants NO at 0.30
      engine.placeOrder({
        marketId: 'test-market',
        token: 'NO',
        side: 'BUY',
        price: 0.30,
        size: 100,
        maker: '0xAlice',
      });

      // Bob wants YES at 0.60 → 0.60 + 0.30 = 0.90 < 1.00 → no match
      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.60,
        size: 100,
        maker: '0xBob',
      });

      expect(result.trades).toHaveLength(0);
      expect(result.remainingOrder).toBeDefined();
    });
  });

  describe('Order Types', () => {
    it('FOK should reject if not fully fillable', () => {
      // Only 50 available
      engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'SELL', price: 0.50, size: 50, maker: '0xAlice' });

      // FOK for 100 → should fail
      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.50,
        size: 100,
        maker: '0xBob',
        type: 'FOK',
      });

      expect(result.trades).toHaveLength(0);
      expect(result.remainingOrder).toBeNull();
    });

    it('FAK should fill what it can and cancel rest', () => {
      engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'SELL', price: 0.50, size: 50, maker: '0xAlice' });

      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.50,
        size: 100,
        maker: '0xBob',
        type: 'FAK',
      });

      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].size).toBe(50);
      expect(result.remainingOrder).toBeNull(); // Remaining cancelled
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel an open order', () => {
      const result = engine.placeOrder({
        marketId: 'test-market',
        token: 'YES',
        side: 'BUY',
        price: 0.50,
        size: 100,
        maker: '0xAlice',
      });

      const cancelled = engine.cancelOrder(result.remainingOrder!.id);
      expect(cancelled).toBeDefined();
      expect(cancelled!.status).toBe('CANCELLED');

      const book = engine.getOrderBook('test-market', 'YES')!;
      expect(book.bids).toHaveLength(0);
    });
  });

  describe('Order Book Snapshot', () => {
    it('should return correct snapshot with multiple levels', () => {
      engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'BUY', price: 0.48, size: 50, maker: '0xA' });
      engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'BUY', price: 0.50, size: 100, maker: '0xB' });
      engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'SELL', price: 0.55, size: 75, maker: '0xC' });
      engine.placeOrder({ marketId: 'test-market', token: 'YES', side: 'SELL', price: 0.58, size: 25, maker: '0xD' });

      const book = engine.getOrderBook('test-market', 'YES')!;

      expect(book.bids).toHaveLength(2);
      expect(book.bids[0].price).toBe(0.50); // Highest bid first
      expect(book.bids[1].price).toBe(0.48);

      expect(book.asks).toHaveLength(2);
      expect(book.asks[0].price).toBe(0.55); // Lowest ask first
      expect(book.asks[1].price).toBe(0.58);

      expect(book.midpoint).toBeCloseTo(0.525, 3);
      expect(book.spread).toBeCloseTo(0.05, 3);
    });
  });

  describe('Validation', () => {
    it('should reject price <= 0 or >= 1', () => {
      expect(() => engine.placeOrder({
        marketId: 'test-market', token: 'YES', side: 'BUY', price: 0, size: 100, maker: '0x1',
      })).toThrow('Price must be between 0 and 1');

      expect(() => engine.placeOrder({
        marketId: 'test-market', token: 'YES', side: 'BUY', price: 1, size: 100, maker: '0x1',
      })).toThrow('Price must be between 0 and 1');
    });

    it('should reject size <= 0', () => {
      expect(() => engine.placeOrder({
        marketId: 'test-market', token: 'YES', side: 'BUY', price: 0.5, size: 0, maker: '0x1',
      })).toThrow('Size must be positive');
    });
  });
});
