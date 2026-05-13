/**
 * OrderBook unit tests — GoodPerps
 *
 * Covers: resting orders, matching (price-time priority), TIF modes,
 * self-trade prevention, cancellation, L2 snapshots, and BBO.
 */

import { OrderBook } from '../OrderBook';
import { Side, OrderType, TimeInForce, OrderStatus } from '../types';
import type { MarketConfig } from '../types';

// ─── Shared market config ─────────────────────────────────────────────────────

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

function mkBook() {
  return new OrderBook(BTC);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let userSeq = 0;
function uid() {
  return `user-${++userSeq}`;
}

function limitBuy(book: OrderBook, userId: string, price: string, size: string, tif = TimeInForce.GTC) {
  return book.placeOrder({ userId, side: Side.Buy, type: OrderType.Limit, price, size, timeInForce: tif });
}

function limitSell(book: OrderBook, userId: string, price: string, size: string, tif = TimeInForce.GTC) {
  return book.placeOrder({ userId, side: Side.Sell, type: OrderType.Limit, price, size, timeInForce: tif });
}

// ─── Resting order tests ──────────────────────────────────────────────────────

describe('OrderBook — resting orders', () => {
  test('buy limit rests when no asks', () => {
    const book = mkBook();
    const { order, trades } = limitBuy(book, uid(), '50000', '0.01');

    expect(trades).toHaveLength(0);
    expect(order.status).toBe(OrderStatus.New);
    expect(book.totalOrders).toBe(1);
  });

  test('sell limit rests when no bids', () => {
    const book = mkBook();
    const { order, trades } = limitSell(book, uid(), '51000', '0.01');

    expect(trades).toHaveLength(0);
    expect(order.status).toBe(OrderStatus.New);
    expect(book.totalOrders).toBe(1);
  });

  test('buy rests below best ask (no cross)', () => {
    const book = mkBook();
    limitSell(book, uid(), '51000', '0.01');   // ask at 51000
    const { trades } = limitBuy(book, uid(), '50000', '0.01');  // bid at 50000

    expect(trades).toHaveLength(0);
    expect(book.totalOrders).toBe(2);
  });
});

// ─── Matching tests ───────────────────────────────────────────────────────────

describe('OrderBook — matching', () => {
  test('exact fill: one buy crosses one sell', () => {
    const book = mkBook();
    const seller = uid();
    const buyer  = uid();

    limitSell(book, seller, '50000', '0.01');
    const { order, trades } = limitBuy(book, buyer, '50000', '0.01');

    expect(trades).toHaveLength(1);
    expect(order.status).toBe(OrderStatus.Filled);
    expect(trades[0].price).toBe('50000');
    expect(trades[0].size).toBe('0.01');
    expect(trades[0].makerUserId).toBe(seller);
    expect(trades[0].takerUserId).toBe(buyer);
    expect(book.totalOrders).toBe(0);  // both orders fully consumed
  });

  test('taker gets price improvement (maker price, not taker price)', () => {
    const book = mkBook();
    limitSell(book, uid(), '50000', '0.01');
    // Taker is willing to pay 50100 but gets filled at maker's 50000
    const { trades } = limitBuy(book, uid(), '50100', '0.01');

    expect(trades[0].price).toBe('50000');
  });

  test('partial fill: taker buy larger than resting sell', () => {
    const book = mkBook();
    limitSell(book, uid(), '50000', '0.01');          // only 0.01 available
    const { order, trades } = limitBuy(book, uid(), '50000', '0.02');  // wants 0.02

    expect(trades).toHaveLength(1);
    expect(trades[0].size).toBe('0.01');
    expect(order.status).toBe(OrderStatus.PartiallyFilled);
    expect(order.remainingSize).toBe('0.01');
    expect(book.totalOrders).toBe(1);  // taker's remainder rests
  });

  test('partial fill: taker sell larger than resting buy', () => {
    const book = mkBook();
    limitBuy(book, uid(), '50000', '0.01');
    const { order, trades } = limitSell(book, uid(), '50000', '0.02');

    expect(trades[0].size).toBe('0.01');
    expect(order.remainingSize).toBe('0.01');
  });

  test('price-time priority: older maker at same price fills first', () => {
    const book = mkBook();
    const first  = uid();
    const second = uid();

    limitSell(book, first,  '50000', '0.01');   // placed first
    limitSell(book, second, '50000', '0.01');   // placed second

    const { trades } = limitBuy(book, uid(), '50000', '0.01');

    expect(trades[0].makerUserId).toBe(first);
  });

  test('sweeps multiple price levels (best-price-first)', () => {
    const book = mkBook();
    limitSell(book, uid(), '50000', '0.01');   // cheaper ask
    limitSell(book, uid(), '50100', '0.01');   // expensive ask

    const { trades } = limitBuy(book, uid(), '50100', '0.02');

    expect(trades).toHaveLength(2);
    expect(Number(trades[0].price)).toBeLessThan(Number(trades[1].price));
  });

  test('buy does not match ask above limit price', () => {
    const book = mkBook();
    limitSell(book, uid(), '51000', '0.01');
    const { trades } = limitBuy(book, uid(), '50000', '0.01');

    expect(trades).toHaveLength(0);
  });
});

// ─── Self-trade prevention ────────────────────────────────────────────────────

describe('OrderBook — self-trade prevention', () => {
  test('order does not fill against own resting order', () => {
    const book = mkBook();
    const user = uid();

    limitSell(book, user, '50000', '0.01');
    const { trades } = limitBuy(book, user, '50000', '0.01');

    expect(trades).toHaveLength(0);
    expect(book.totalOrders).toBe(2);
  });

  test('different users do trade at the same price', () => {
    const book = mkBook();
    limitSell(book, uid(), '50000', '0.01');
    const { trades } = limitBuy(book, uid(), '50000', '0.01');
    expect(trades).toHaveLength(1);
  });
});

// ─── TIF modes ────────────────────────────────────────────────────────────────

describe('OrderBook — TimeInForce', () => {
  test('GTC: unfilled remainder rests', () => {
    const book = mkBook();
    const { order } = limitBuy(book, uid(), '50000', '0.01', TimeInForce.GTC);
    expect(order.status).toBe(OrderStatus.New);
    expect(book.totalOrders).toBe(1);
  });

  test('IOC: unfilled remainder cancelled (no match)', () => {
    const book = mkBook();
    const { order } = limitBuy(book, uid(), '50000', '0.01', TimeInForce.IOC);
    expect(order.status).toBe(OrderStatus.Canceled);
    expect(book.totalOrders).toBe(0);
  });

  test('IOC: partial fill then cancel', () => {
    const book = mkBook();
    limitSell(book, uid(), '50000', '0.005');       // only 0.005 available
    const { order, trades } = limitBuy(book, uid(), '50000', '0.01', TimeInForce.IOC);

    expect(trades[0].size).toBe('0.005');
    expect(order.status).toBe(OrderStatus.PartiallyFilled);
    expect(book.totalOrders).toBe(0);  // unfilled portion not resting
  });

  test('PostOnly: rejects if would cross', () => {
    const book = mkBook();
    limitSell(book, uid(), '50000', '0.01');
    const { order, trades } = limitBuy(book, uid(), '50000', '0.01', TimeInForce.PostOnly);

    expect(order.status).toBe(OrderStatus.Rejected);
    expect(trades).toHaveLength(0);
    // The resting sell should still be there
    expect(book.totalOrders).toBe(1);
  });

  test('PostOnly: rests if no cross', () => {
    const book = mkBook();
    const { order } = limitBuy(book, uid(), '49900', '0.01', TimeInForce.PostOnly);
    expect(order.status).toBe(OrderStatus.New);
    expect(book.totalOrders).toBe(1);
  });

  test('Market order converts to IOC with aggressive price', () => {
    const book = mkBook();
    limitSell(book, uid(), '50000', '0.01');
    const { order, trades } = book.placeOrder({
      userId: uid(),
      side: Side.Buy,
      type: OrderType.Market,
      price: '0',   // ignored for market orders
      size: '0.01',
    });
    expect(trades).toHaveLength(1);
    expect(order.status).toBe(OrderStatus.Filled);
  });
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('OrderBook — cancellation', () => {
  test('cancel removes order from book', () => {
    const book = mkBook();
    const user = uid();
    const { order } = limitBuy(book, user, '50000', '0.01');
    const cancelled = book.cancelOrder(order.id, user);

    expect(cancelled).not.toBeNull();
    expect(cancelled!.status).toBe(OrderStatus.Canceled);
    expect(book.totalOrders).toBe(0);
  });

  test('cancel by wrong user returns null', () => {
    const book = mkBook();
    const { order } = limitBuy(book, uid(), '50000', '0.01');
    const result = book.cancelOrder(order.id, uid());  // different user

    expect(result).toBeNull();
    expect(book.totalOrders).toBe(1);  // still resting
  });

  test('cancel already filled order returns null', () => {
    const book = mkBook();
    const buyer = uid();
    limitSell(book, uid(), '50000', '0.01');
    const { order } = limitBuy(book, buyer, '50000', '0.01');

    const result = book.cancelOrder(order.id, buyer);
    expect(result).toBeNull();
  });
});

// ─── L2 snapshot ─────────────────────────────────────────────────────────────

describe('OrderBook — L2 snapshot and BBO', () => {
  test('getL2Book returns correct bid/ask levels', () => {
    const book = mkBook();
    const buyer  = uid();
    const seller = uid();

    limitBuy(book,  buyer,  '49900', '0.1');
    limitBuy(book,  buyer,  '49800', '0.2');
    limitSell(book, seller, '50000', '0.1');
    limitSell(book, seller, '50100', '0.3');

    const snap = book.getL2Book();
    expect(snap.bids[0].price).toBe('49900');   // highest bid first
    expect(snap.asks[0].price).toBe('50000');   // lowest ask first
    expect(snap.bids).toHaveLength(2);
    expect(snap.asks).toHaveLength(2);
  });

  test('getBBO returns best bid and ask', () => {
    const book = mkBook();
    limitBuy(book,  uid(), '49900', '0.01');
    limitSell(book, uid(), '50000', '0.01');

    const { bestBid, bestAsk, spread } = book.getBBO();
    expect(bestBid).toBe('49900');
    expect(bestAsk).toBe('50000');
    expect(Number(spread)).toBeCloseTo(100, 1);
  });

  test('getBBO returns nulls on empty book', () => {
    const book = mkBook();
    const { bestBid, bestAsk } = book.getBBO();
    expect(bestBid).toBeNull();
    expect(bestAsk).toBeNull();
  });

  test('L2 depth respected', () => {
    const book = mkBook();
    for (let i = 0; i < 5; i++) {
      limitBuy(book, uid(), String(50000 - i * 100), '0.01');
    }
    const snap = book.getL2Book(3);
    expect(snap.bids).toHaveLength(3);
  });
});

// ─── Fee calculation ──────────────────────────────────────────────────────────

describe('OrderBook — fee calculation', () => {
  test('taker pays positive fee, maker receives rebate', () => {
    const book = mkBook();
    limitSell(book, uid(), '50000', '0.01');
    const { trades } = limitBuy(book, uid(), '50000', '0.01');

    const t = trades[0];
    expect(Number(t.takerFee)).toBeGreaterThan(0);
    // Maker fee rate is negative (rebate) → fee is negative
    expect(Number(t.makerFee)).toBeLessThan(0);
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('OrderBook — validation', () => {
  test('rejects size below minimum', () => {
    const book = mkBook();
    expect(() =>
      limitBuy(book, uid(), '50000', '0.0001')  // below 0.001 min
    ).toThrow();
  });

  test('rejects size above maximum', () => {
    const book = mkBook();
    expect(() =>
      limitBuy(book, uid(), '50000', '200')  // above 100 max
    ).toThrow();
  });

  test('rejects price not on tick', () => {
    const book = mkBook();
    expect(() =>
      limitBuy(book, uid(), '50000.05', '0.01')  // tickSize=0.1
    ).toThrow();
  });
});
