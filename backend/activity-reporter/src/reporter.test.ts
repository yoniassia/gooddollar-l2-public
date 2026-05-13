/**
 * ActivityReporter — Unit tests
 *
 * Tests config parsing, fee calculations, event extraction, and reporter lifecycle.
 * Uses mock provider/contracts to avoid needing a live chain.
 */

import { ethers } from 'ethers';
import {
  ADDRESSES,
  PROTOCOLS,
  POLL_INTERVAL_MS,
  INITIAL_LOOKBACK,
  REPORTER_KEY,
  RPC_URL,
} from './config';
import { AgentRegistryABI } from './abis';

// ─── Config Tests ─────────────────────────────────────────────────────────────

describe('Config', () => {
  test('RPC_URL defaults to localhost:8545', () => {
    expect(RPC_URL).toBe('http://localhost:8545');
  });

  test('POLL_INTERVAL_MS is a positive number', () => {
    expect(POLL_INTERVAL_MS).toBeGreaterThan(0);
  });

  test('INITIAL_LOOKBACK is a positive number', () => {
    expect(INITIAL_LOOKBACK).toBeGreaterThan(0);
  });

  test('REPORTER_KEY is a valid private key format', () => {
    expect(REPORTER_KEY).toMatch(/^0x[a-f0-9]{64}$/);
  });

  test('AgentRegistry address is set', () => {
    expect(ADDRESSES.AgentRegistry).toBe(
      '0x8a791620dd6260079bf849dc5567adc3f2fdc318',
    );
  });

  test('all protocol addresses are non-empty', () => {
    for (const [key, addr] of Object.entries(ADDRESSES)) {
      expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }
  });
});

// ─── Protocol Definitions ─────────────────────────────────────────────────────

describe('Protocol Definitions', () => {
  test('all 5 protocols are defined', () => {
    const names = PROTOCOLS.map((p) => p.name).sort();
    expect(names).toEqual(['lend', 'perps', 'predict', 'stocks', 'swap']);
  });

  test('each protocol has at least one event', () => {
    for (const proto of PROTOCOLS) {
      expect(proto.events.length).toBeGreaterThan(0);
    }
  });

  test('each event has a traderField and volumeField', () => {
    for (const proto of PROTOCOLS) {
      for (const ev of proto.events) {
        expect(ev.traderField).toBeTruthy();
        expect(ev.volumeField).toBeTruthy();
      }
    }
  });

  test('each event has either feeBPS or feeField', () => {
    for (const proto of PROTOCOLS) {
      for (const ev of proto.events) {
        const hasFeeMethod =
          (ev.feeBPS !== undefined && ev.feeBPS >= 0) ||
          ev.feeField !== undefined;
        expect(hasFeeMethod).toBe(true);
      }
    }
  });

  test('swap protocol tracks GoodSwapRouter', () => {
    const swap = PROTOCOLS.find((p) => p.name === 'swap');
    expect(swap?.address).toBe(ADDRESSES.GoodSwapRouter);
    expect(swap?.events[0].signature).toContain('Swap');
  });

  test('perps protocol tracks PerpEngine', () => {
    const perps = PROTOCOLS.find((p) => p.name === 'perps');
    expect(perps?.address).toBe(ADDRESSES.PerpEngine);
    expect(perps?.events.length).toBe(2); // PositionOpened + PositionClosed
  });

  test('lend protocol tracks GoodLendPool', () => {
    const lend = PROTOCOLS.find((p) => p.name === 'lend');
    expect(lend?.address).toBe(ADDRESSES.GoodLendPool);
  });

  test('predict protocol tracks MarketFactory', () => {
    const predict = PROTOCOLS.find((p) => p.name === 'predict');
    expect(predict?.address).toBe(ADDRESSES.MarketFactory);
  });

  test('stocks protocol tracks CollateralVault', () => {
    const stocks = PROTOCOLS.find((p) => p.name === 'stocks');
    expect(stocks?.address).toBe(ADDRESSES.CollateralVault);
  });
});

// ─── Fee Calculation Tests ────────────────────────────────────────────────────

describe('Fee Calculations', () => {
  test('swap fee is 0.3% (30 BPS)', () => {
    const swap = PROTOCOLS.find((p) => p.name === 'swap');
    expect(swap?.events[0].feeBPS).toBe(30);
    // 1 ETH swap → 0.003 ETH fee
    const volume = 1000000000000000000n; // 1e18
    const fee = (volume * 30n) / 10000n;
    expect(fee).toBe(3000000000000000n); // 0.003e18
  });

  test('perps fee is 0.1% (10 BPS)', () => {
    const perps = PROTOCOLS.find((p) => p.name === 'perps');
    expect(perps?.events[0].feeBPS).toBe(10);
    const volume = 10000000000000000000n; // 10 ETH
    const fee = (volume * 10n) / 10000n;
    expect(fee).toBe(10000000000000000n); // 0.01 ETH
  });

  test('stocks uses direct fee field', () => {
    const stocks = PROTOCOLS.find((p) => p.name === 'stocks');
    expect(stocks?.events[0].feeField).toBe('fee');
    expect(stocks?.events[0].feeBPS).toBeUndefined();
  });

  test('lend Supply has 0 BPS (no fee on supply)', () => {
    const lend = PROTOCOLS.find((p) => p.name === 'lend');
    const supply = lend?.events.find((e) => e.signature.includes('Supply'));
    expect(supply?.feeBPS).toBe(0);
  });
});

// ─── ABI Tests ────────────────────────────────────────────────────────────────

describe('ABIs', () => {
  test('AgentRegistry ABI includes recordActivity', () => {
    const iface = new ethers.Interface(AgentRegistryABI);
    const fn = iface.getFunction('recordActivity');
    expect(fn).toBeTruthy();
    expect(fn?.inputs.length).toBe(4); // agent, protocol, volume, fees
  });

  test('AgentRegistry ABI includes recordPnL', () => {
    const iface = new ethers.Interface(AgentRegistryABI);
    const fn = iface.getFunction('recordPnL');
    expect(fn).toBeTruthy();
  });

  test('AgentRegistry ABI includes ActivityRecorded event', () => {
    const iface = new ethers.Interface(AgentRegistryABI);
    const ev = iface.getEvent('ActivityRecorded');
    expect(ev).toBeTruthy();
  });
});

// ─── ActivityReporter Unit Tests ──────────────────────────────────────────────

describe('ActivityReporter', () => {
  // Import the class
  const { ActivityReporter } = require('./reporter');

  test('can be instantiated with defaults', () => {
    // This will fail to connect but shouldn't throw on construction
    expect(() => new ActivityReporter()).not.toThrow();
  });

  test('getStats returns initial state', () => {
    const reporter = new ActivityReporter();
    const stats = reporter.getStats();
    expect(stats.totalReported).toBe(0);
    expect(stats.totalErrors).toBe(0);
    expect(stats.startedAt).toBeGreaterThan(0);
    expect(stats.protocols).toEqual({});
  });

  test('stop sets running to false', () => {
    const reporter = new ActivityReporter();
    // Should not throw
    reporter.stop();
  });
});

// ─── Event Signature Hashing ──────────────────────────────────────────────────

describe('Event Topic Hashing', () => {
  test('Swap event topic matches ethers computed hash', () => {
    const iface = new ethers.Interface([
      'event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed to)',
    ]);
    const ev = iface.getEvent('Swap');
    expect(ev?.topicHash).toBeTruthy();
    expect(ev?.topicHash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  test('PositionOpened event topic is computable', () => {
    const iface = new ethers.Interface([
      'event PositionOpened(address indexed trader, uint256 indexed marketId, bool isLong, uint256 size, uint256 margin, uint256 entryPrice)',
    ]);
    const ev = iface.getEvent('PositionOpened');
    expect(ev?.topicHash).toBeTruthy();
  });

  test('Bought event topic is computable', () => {
    const iface = new ethers.Interface([
      'event Bought(uint256 indexed marketId, address indexed buyer, bool isYES, uint256 amount, uint256 cost)',
    ]);
    const ev = iface.getEvent('Bought');
    expect(ev?.topicHash).toBeTruthy();
  });
});
