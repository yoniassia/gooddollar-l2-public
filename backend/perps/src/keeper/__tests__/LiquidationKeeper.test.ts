/**
 * LiquidationKeeper unit tests — GoodPerps
 *
 * Covers: position tracking, margin/account-state calculations,
 * liquidation detection, checkAndLiquidate loop, and stats.
 */

import { LiquidationKeeper, AccountState } from '../LiquidationKeeper';
import { Side, MarginMode, MarketConfig } from '../../orderbook/types';
import type { Position } from '../../orderbook/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BTC_CONFIG: MarketConfig = {
  symbol: 'BTC-USD',
  baseAsset: 'BTC',
  quoteAsset: 'USD',
  tickSize: '0.1',
  lotSize: '0.001',
  minOrderSize: '0.001',
  maxOrderSize: '100',
  maxLeverage: 50,
  maintenanceMarginRate: '0.005',   // 0.5%
  initialMarginRate: '0.02',
  makerFeeRate: '-0.0002',
  takerFeeRate: '0.0005',
  fundingInterval: 3_600_000,
};

const ETH_CONFIG: MarketConfig = {
  ...BTC_CONFIG,
  symbol: 'ETH-USD',
  baseAsset: 'ETH',
  maintenanceMarginRate: '0.005',
};

const MARKET_CONFIGS = new Map<string, MarketConfig>([
  ['BTC-USD', BTC_CONFIG],
  ['ETH-USD', ETH_CONFIG],
]);

// ─── Mock Oracle ──────────────────────────────────────────────────────────────

function mockOracle(prices: Record<string, string>) {
  return {
    getMarkPrice: (market: string): string | null => prices[market] ?? null,
  } as any;
}

// ─── Mock Contracts ───────────────────────────────────────────────────────────

function mockContracts(liquidateSpy = jest.fn().mockResolvedValue('0xdeadbeef')) {
  return {
    liquidatePosition: liquidateSpy,
  } as any;
}

// ─── Position factory ─────────────────────────────────────────────────────────

let userSeq = 0;
function uid() { return `user-${++userSeq}`; }

function mkPosition(overrides: Partial<Position> & {
  userId: string;
  market: string;
  side: Side;
  size: string;
  entryPrice: string;
  margin: string;
}): Position {
  return {
    markPrice: overrides.entryPrice,
    liquidationPrice: '0',
    unrealizedPnl: '0',
    realizedPnl: '0',
    leverage: 10,
    marginMode: MarginMode.Isolated,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── Position tracking ────────────────────────────────────────────────────────

describe('LiquidationKeeper — position tracking', () => {
  test('trackPosition adds a new position', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '1', entryPrice: '50000', margin: '5000' }));

    const state = keeper.getAccountState(user);
    expect(state).not.toBeNull();
    expect(state!.positions).toHaveLength(1);
  });

  test('trackPosition updates existing position for same market', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '1', entryPrice: '50000', margin: '5000' }));
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '2', entryPrice: '49000', margin: '5000' }));

    const state = keeper.getAccountState(user);
    expect(state!.positions).toHaveLength(1);
    expect(state!.positions[0].size).toBe('2');
  });

  test('trackPosition handles multiple markets per user', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '1', entryPrice: '50000', margin: '5000' }));
    keeper.trackPosition(mkPosition({ userId: user, market: 'ETH-USD', side: Side.Sell, size: '10', entryPrice: '3000', margin: '3000' }));

    const state = keeper.getAccountState(user);
    expect(state!.positions).toHaveLength(2);
  });

  test('untrackPosition removes a position', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '1', entryPrice: '50000', margin: '5000' }));
    keeper.untrackPosition(user, 'BTC-USD');

    expect(keeper.getAccountState(user)).toBeNull();
  });

  test('untrackPosition removes user when last position is gone', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '1', entryPrice: '50000', margin: '5000' }));
    keeper.untrackPosition(user, 'BTC-USD');
    // Second call on already-removed user should not throw
    expect(() => keeper.untrackPosition(user, 'BTC-USD')).not.toThrow();
  });

  test('getAccountState returns null for unknown user', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    expect(keeper.getAccountState('no-such-user')).toBeNull();
  });
});

// ─── Account state — healthy position ─────────────────────────────────────────

describe('LiquidationKeeper — account state (healthy)', () => {
  test('long position with mark == entry has zero PnL', () => {
    const price = '50000';
    const keeper = new LiquidationKeeper(mockOracle({ 'BTC-USD': price }), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    // margin = 5000, size = 0.1 BTC, maintenanceMarginRate = 0.5%
    // notional = 0.1 * 50000 = 5000, maintenanceMargin = 5000 * 0.005 = 25
    // accountValue = 5000 + 0 = 5000
    // marginRatio = 25 / 5000 = 0.005 → not liquidatable
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.1', entryPrice: price, margin: '5000' }));
    const state = keeper.getAccountState(user)!;

    expect(state.isLiquidatable).toBe(false);
    expect(parseFloat(state.unrealizedPnl)).toBeCloseTo(0);
    expect(parseFloat(state.accountValue)).toBeCloseTo(5000);
  });

  test('long position with mark above entry has positive PnL', () => {
    const keeper = new LiquidationKeeper(mockOracle({ 'BTC-USD': '55000' }), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    // size=0.1, entry=50000, mark=55000 → PnL = 0.1*(55000-50000) = 500
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.1', entryPrice: '50000', margin: '1000' }));
    const state = keeper.getAccountState(user)!;

    expect(parseFloat(state.unrealizedPnl)).toBeCloseTo(500);
    expect(state.isLiquidatable).toBe(false);
  });

  test('short position with mark below entry has positive PnL', () => {
    const keeper = new LiquidationKeeper(mockOracle({ 'BTC-USD': '45000' }), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    // size=0.1, entry=50000, mark=45000 → PnL = 0.1*(50000-45000) = 500
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Sell, size: '0.1', entryPrice: '50000', margin: '1000' }));
    const state = keeper.getAccountState(user)!;

    expect(parseFloat(state.unrealizedPnl)).toBeCloseTo(500);
    expect(state.isLiquidatable).toBe(false);
  });
});

// ─── Account state — liquidatable position ───────────────────────────────────

describe('LiquidationKeeper — liquidation detection', () => {
  test('long position with catastrophic loss is liquidatable', () => {
    // Entry 50000, mark drops to 1000 → total loss of 49000*size
    // size=0.1, margin=100 → PnL = 0.1*(1000-50000) = -4900
    // accountValue = 100 - 4900 = -4800 → marginRatio >= 1
    const keeper = new LiquidationKeeper(mockOracle({ 'BTC-USD': '1000' }), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.1', entryPrice: '50000', margin: '100' }));

    const state = keeper.getAccountState(user)!;
    expect(state.isLiquidatable).toBe(true);
  });

  test('short position with price spike is liquidatable', () => {
    // Short 0.1 BTC at 50000 with $100 margin. Mark spikes to 100000
    // PnL = 0.1*(50000-100000) = -5000 → accountValue = 100 - 5000 = -4900 → liquidatable
    const keeper = new LiquidationKeeper(mockOracle({ 'BTC-USD': '100000' }), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Sell, size: '0.1', entryPrice: '50000', margin: '100' }));

    const state = keeper.getAccountState(user)!;
    expect(state.isLiquidatable).toBe(true);
  });

  test('position with no oracle price does not compute PnL', () => {
    // Oracle returns null → position skipped in PnL/margin calc
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '1', entryPrice: '50000', margin: '5000' }));

    // No price available → accountValue = margin, maintenanceMargin = 0 → safe
    const state = keeper.getAccountState(user)!;
    expect(state.isLiquidatable).toBe(false);
  });
});

// ─── Liquidation execution ────────────────────────────────────────────────────

describe('LiquidationKeeper — liquidation execution', () => {
  test('checkAndLiquidate calls contracts.liquidatePosition for liquidatable account', async () => {
    const liquidateSpy = jest.fn().mockResolvedValue('0xdeadbeef');
    const keeper = new LiquidationKeeper(
      mockOracle({ 'BTC-USD': '1000' }),
      mockContracts(liquidateSpy),
      MARKET_CONFIGS,
    );
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.1', entryPrice: '50000', margin: '100' }));

    // Trigger one check cycle via start/stop with short interval
    // We invoke the private method indirectly via start() + short delay
    // Instead, test via a direct call using (keeper as any)
    await (keeper as any).checkAndLiquidate();

    expect(liquidateSpy).toHaveBeenCalledTimes(1);
    expect(liquidateSpy).toHaveBeenCalledWith(user, 'BTC-USD', '1000');
  });

  test('after liquidation, position is untracked', async () => {
    const liquidateSpy = jest.fn().mockResolvedValue('0xdeadbeef');
    const keeper = new LiquidationKeeper(
      mockOracle({ 'BTC-USD': '1000' }),
      mockContracts(liquidateSpy),
      MARKET_CONFIGS,
    );
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.1', entryPrice: '50000', margin: '100' }));

    await (keeper as any).checkAndLiquidate();

    expect(keeper.getAccountState(user)).toBeNull();
  });

  test('healthy accounts are not liquidated', async () => {
    const liquidateSpy = jest.fn();
    const keeper = new LiquidationKeeper(
      mockOracle({ 'BTC-USD': '50000' }),
      mockContracts(liquidateSpy),
      MARKET_CONFIGS,
    );
    const user = uid();
    // Well-collateralized: 1000 margin, 0.001 BTC position at entry
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.001', entryPrice: '50000', margin: '1000' }));

    await (keeper as any).checkAndLiquidate();

    expect(liquidateSpy).not.toHaveBeenCalled();
  });

  test('liquidation failure does not crash the keeper', async () => {
    const liquidateSpy = jest.fn().mockRejectedValue(new Error('revert'));
    const keeper = new LiquidationKeeper(
      mockOracle({ 'BTC-USD': '1000' }),
      mockContracts(liquidateSpy),
      MARKET_CONFIGS,
    );
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.1', entryPrice: '50000', margin: '100' }));

    // Should not throw
    await expect((keeper as any).checkAndLiquidate()).resolves.toBeUndefined();
  });

  test('liquidates largest position first', async () => {
    const callOrder: string[] = [];
    const liquidateSpy = jest.fn().mockImplementation((_user: string, market: string) => {
      callOrder.push(market);
      return Promise.resolve(`0x${market}`);
    });

    const keeper = new LiquidationKeeper(
      mockOracle({ 'BTC-USD': '1000', 'ETH-USD': '100' }),
      mockContracts(liquidateSpy),
      MARKET_CONFIGS,
    );
    const user = uid();
    // BTC notional: 0.1 * 1000 = 100; ETH notional: 10 * 100 = 1000 → ETH first
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.1', entryPrice: '50000', margin: '50' }));
    keeper.trackPosition(mkPosition({ userId: user, market: 'ETH-USD', side: Side.Buy, size: '10', entryPrice: '3000', margin: '50' }));

    await (keeper as any).checkAndLiquidate();

    expect(callOrder[0]).toBe('ETH-USD');
    expect(callOrder[1]).toBe('BTC-USD');
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('LiquidationKeeper — stats', () => {
  test('getStats reflects tracked positions', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '1', entryPrice: '50000', margin: '5000' }));

    const stats = keeper.getStats();
    expect(stats.trackedAccounts).toBe(1);
    expect(stats.totalPositions).toBe(1);
    expect(stats.liquidationsTriggered).toBe(0);
  });

  test('liquidation increments stats', async () => {
    const liquidateSpy = jest.fn().mockResolvedValue('0xdeadbeef');
    const keeper = new LiquidationKeeper(
      mockOracle({ 'BTC-USD': '1000' }),
      mockContracts(liquidateSpy),
      MARKET_CONFIGS,
    );
    const user = uid();
    keeper.trackPosition(mkPosition({ userId: user, market: 'BTC-USD', side: Side.Buy, size: '0.1', entryPrice: '50000', margin: '100' }));

    await (keeper as any).checkAndLiquidate();

    const stats = keeper.getStats();
    expect(stats.liquidationsTriggered).toBe(1);
    expect(parseFloat(stats.totalLiquidatedVolume)).toBeCloseTo(100); // 0.1 * 1000
  });

  test('checksPerformed increments on each cycle', async () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);

    await (keeper as any).checkAndLiquidate();
    await (keeper as any).checkAndLiquidate();

    expect(keeper.getStats().checksPerformed).toBe(2);
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('LiquidationKeeper — lifecycle', () => {
  test('start() and stop() do not throw', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    expect(() => keeper.start()).not.toThrow();
    expect(() => keeper.stop()).not.toThrow();
  });

  test('calling start() twice is idempotent', () => {
    const keeper = new LiquidationKeeper(mockOracle({}), mockContracts(), MARKET_CONFIGS);
    keeper.start();
    keeper.start(); // should not create a second interval
    keeper.stop();
  });
});
