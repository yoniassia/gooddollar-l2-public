/**
 * MatchingEngine unit tests — GoodPerps
 *
 * Covers: market management, order submission, event emission,
 * settlement batch generation, external routing, and cancellation.
 */

import { MatchingEngine } from '../MatchingEngine';
import { Side, OrderType, TimeInForce, OrderStatus } from '../types';
import type { MarketConfig, Trade } from '../types';

// ─── Market config fixtures ───────────────────────────────────────────────────

const BTC: MarketConfig = {
  symbol: 'BTC-USD',
  baseAsset: 'BTC',
  quoteAsset: 'USD',
  tickSize: '0.1',
  lotSize: '0.001',
  minOrderSize: '0.001',
  maxOrderSize: '100',
  maxLeverage: 50,
  maintenanceMarginRate: '0.005',
  initialMarginRate: '0.01',
  makerFeeRate: '-0.0002',
  takerFeeRate: '0.0005',
  fundingInterval: 3_600_000,
};

const ETH: MarketConfig = {
  ...BTC,
  symbol: 'ETH-USD',
  baseAsset: 'ETH',
  tickSize: '0.01',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let seq = 0;
const uid = () => `user-${++seq}`;

function mkEngine() {
  const engine = new MatchingEngine();
  engine.addMarket(BTC);
  return engine;
}

// ─── Market management ────────────────────────────────────────────────────────

describe('MatchingEngine — market management', () => {
  test('addMarket registers the market', () => {
    const engine = new MatchingEngine();
    engine.addMarket(BTC);
    expect(engine.getMarkets()).toContain('BTC-USD');
  });

  test('addMarket throws on duplicate', () => {
    const engine = new MatchingEngine();
    engine.addMarket(BTC);
    expect(() => engine.addMarket(BTC)).toThrow();
  });

  test('supports multiple markets', () => {
    const engine = new MatchingEngine();
    engine.addMarket(BTC);
    engine.addMarket(ETH);
    expect(engine.getMarkets()).toHaveLength(2);
  });

  test('getMarketConfig returns config', () => {
    const engine = mkEngine();
    const cfg = engine.getMarketConfig('BTC-USD');
    expect(cfg?.symbol).toBe('BTC-USD');
    expect(cfg?.maxLeverage).toBe(50);
  });

  test('getMarketConfig returns undefined for unknown market', () => {
    const engine = mkEngine();
    expect(engine.getMarketConfig('UNKNOWN')).toBeUndefined();
  });
});

// ─── Order submission ─────────────────────────────────────────────────────────

describe('MatchingEngine — order submission', () => {
  test('submitOrder returns MatchResult with order', () => {
    const engine = mkEngine();
    const result = engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    expect(result.order).toBeDefined();
    expect(result.order.status).toBe(OrderStatus.New);
    expect(result.internalTrades).toHaveLength(0);
    expect(result.externalRouted).toBe(false);
  });

  test('submitOrder throws for unknown market', () => {
    const engine = mkEngine();
    expect(() =>
      engine.submitOrder({
        userId: uid(),
        market: 'UNKNOWN',
        side: Side.Buy,
        type: OrderType.Limit,
        price: '50000',
        size: '0.01',
      })
    ).toThrow('Unknown market');
  });

  test('two crossing limits generate a trade', () => {
    const engine = mkEngine();
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Sell,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    const result = engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    expect(result.internalTrades).toHaveLength(1);
    expect(result.order.status).toBe(OrderStatus.Filled);
  });
});

// ─── Event emission ───────────────────────────────────────────────────────────

describe('MatchingEngine — events', () => {
  test('emits "order" event on submit', done => {
    const engine = mkEngine();
    engine.once('order', order => {
      expect(order.market).toBe('BTC-USD');
      done();
    });
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });
  });

  test('emits "trade" event on match', done => {
    const engine = mkEngine();
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Sell,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    engine.once('trade', (trade: Trade) => {
      expect(trade.market).toBe('BTC-USD');
      expect(trade.price).toBe('50000');
      done();
    });

    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });
  });

  test('emits "bookUpdate" event on submit', done => {
    const engine = mkEngine();
    engine.once('bookUpdate', book => {
      expect(book.market).toBe('BTC-USD');
      done();
    });
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });
  });
});

// ─── Settlement batching ──────────────────────────────────────────────────────

describe('MatchingEngine — settlement batching', () => {
  test('stop() flushes pending trades as settlement batch', done => {
    const engine = mkEngine();

    // Place a crossing pair
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Sell,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    engine.once('settlement', batch => {
      expect(batch.trades).toHaveLength(1);
      expect(Number(batch.totalVolume)).toBeGreaterThan(0);
      expect(batch.id).toMatch(/^batch-/);
      done();
    });

    engine.stop();   // immediately flushes pending settlement
  });

  test('settlement batch includes totalFees', done => {
    const engine = mkEngine();

    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Sell,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    engine.once('settlement', batch => {
      // takerFee > 0 (positive), makerFee < 0 (rebate), net should be positive
      expect(Number(batch.totalFees)).not.toBeNaN();
      done();
    });

    engine.stop();
  });

  test('no settlement emitted when no trades', () => {
    const engine = mkEngine();
    const settlementSpy = jest.fn();
    engine.on('settlement', settlementSpy);

    // Place resting order with no match
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    engine.stop();
    expect(settlementSpy).not.toHaveBeenCalled();
  });
});

// ─── External routing ─────────────────────────────────────────────────────────

describe('MatchingEngine — external routing', () => {
  test('market order with unmatched remainder routes externally', done => {
    const engine = mkEngine();

    engine.once('routeExternal', payload => {
      expect(payload.market).toBe('BTC-USD');
      expect(Number(payload.size)).toBeGreaterThan(0);
      done();
    });

    // No resting liquidity → full size unmatched → external route
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Market,
      price: '0',
      size: '0.01',
    });
  });

  test('fully matched market order does not route externally', () => {
    const engine = mkEngine();
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Sell,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    const routeSpy = jest.fn();
    engine.on('routeExternal', routeSpy);

    const result = engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Market,
      price: '0',
      size: '0.01',
    });

    expect(result.externalRouted).toBe(false);
    expect(routeSpy).not.toHaveBeenCalled();
  });
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('MatchingEngine — cancellation', () => {
  test('cancelOrder removes the order', () => {
    const engine = mkEngine();
    const user = uid();

    const { order } = engine.submitOrder({
      userId: user,
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    const cancelled = engine.cancelOrder('BTC-USD', order.id, user);
    expect(cancelled).not.toBeNull();
    expect(cancelled!.status).toBe(OrderStatus.Canceled);
  });

  test('cancelOrder emits "order" and "bookUpdate" events', done => {
    const engine = mkEngine();
    const user = uid();

    const { order } = engine.submitOrder({
      userId: user,
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    let orderEventFired = false;
    engine.on('order', o => {
      if (o.id === order.id && o.status === OrderStatus.Canceled) {
        orderEventFired = true;
      }
    });

    engine.once('bookUpdate', () => {
      expect(orderEventFired).toBe(true);
      done();
    });

    engine.cancelOrder('BTC-USD', order.id, user);
  });

  test('cancelOrder returns null for unknown market', () => {
    const engine = mkEngine();
    expect(engine.cancelOrder('UNKNOWN', 'some-id', uid())).toBeNull();
  });
});

// ─── Query APIs ───────────────────────────────────────────────────────────────

describe('MatchingEngine — queries', () => {
  test('getBook returns L2 snapshot', () => {
    const engine = mkEngine();
    engine.submitOrder({
      userId: uid(),
      market: 'BTC-USD',
      side: Side.Buy,
      type: OrderType.Limit,
      price: '50000',
      size: '0.01',
    });

    const book = engine.getBook('BTC-USD');
    expect(book).not.toBeNull();
    expect(book!.bids[0].price).toBe('50000');
  });

  test('getBook returns null for unknown market', () => {
    const engine = mkEngine();
    expect(engine.getBook('UNKNOWN')).toBeNull();
  });

  test('getRecentTrades returns matched trades', () => {
    const engine = mkEngine();
    engine.submitOrder({ userId: uid(), market: 'BTC-USD', side: Side.Sell, type: OrderType.Limit, price: '50000', size: '0.01' });
    engine.submitOrder({ userId: uid(), market: 'BTC-USD', side: Side.Buy,  type: OrderType.Limit, price: '50000', size: '0.01' });

    const trades = engine.getRecentTrades('BTC-USD');
    expect(trades).toHaveLength(1);
    expect(trades[0].price).toBe('50000');
  });

  test('getUserOrders returns open orders for user', () => {
    const engine = mkEngine();
    const user = uid();

    engine.submitOrder({ userId: user, market: 'BTC-USD', side: Side.Buy, type: OrderType.Limit, price: '49000', size: '0.01' });
    engine.submitOrder({ userId: user, market: 'BTC-USD', side: Side.Buy, type: OrderType.Limit, price: '48000', size: '0.01' });

    const orders = engine.getUserOrders(user);
    expect(orders).toHaveLength(2);
  });

  test('getBBO returns best prices', () => {
    const engine = mkEngine();
    engine.submitOrder({ userId: uid(), market: 'BTC-USD', side: Side.Buy,  type: OrderType.Limit, price: '49900', size: '0.01' });
    engine.submitOrder({ userId: uid(), market: 'BTC-USD', side: Side.Sell, type: OrderType.Limit, price: '50000', size: '0.01' });

    const bbo = engine.getBBO('BTC-USD');
    expect(bbo?.bestBid).toBe('49900');
    expect(bbo?.bestAsk).toBe('50000');
  });
});
