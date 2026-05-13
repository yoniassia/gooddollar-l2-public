/**
 * OracleAggregator unit tests — GoodPerps
 *
 * Covers: price aggregation (median), staleness detection,
 * funding rate calculation and capping, Pyth/HL event handling,
 * and Chainlink price injection.
 */

import { OracleAggregator } from '../OracleAggregator';

// ─── Mock feeds ───────────────────────────────────────────────────────────────

/**
 * Minimal EventEmitter-compatible mock that lets us trigger 'mids' and 'price'
 * events from the test, without touching any real network.
 */
function mkHlFeed() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    on(event: string, cb: Function) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
    },
    emit(event: string, data: any) {
      (listeners.get(event) ?? []).forEach(cb => cb(data));
    },
  } as any;
}

function mkPythFeed() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    on(event: string, cb: Function) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
    },
    emit(event: string, data: any) {
      (listeners.get(event) ?? []).forEach(cb => cb(data));
    },
  } as any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Inject a price into the OracleAggregator's internal pythPrices map via an event. */
function sendPythPrice(pyth: ReturnType<typeof mkPythFeed>, market: string, price: string) {
  pyth.emit('price', { market, price, timestamp: Date.now() });
}

/** Inject HL mids via event. */
function sendHlMids(hl: ReturnType<typeof mkHlFeed>, mids: Record<string, string>) {
  hl.emit('mids', mids);
}

/** Force the aggregator to run one price update cycle. */
async function tick(agg: OracleAggregator) {
  (agg as any).updateAllPrices();
  await Promise.resolve(); // flush micro-tasks
}

// ─── Initialization ───────────────────────────────────────────────────────────

describe('OracleAggregator — initialization', () => {
  test('getMarkPrice returns null before any prices', () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    expect(agg.getMarkPrice('BTC-USD')).toBeNull();
  });

  test('getPrice returns null for unknown market', () => {
    const agg = new OracleAggregator(mkHlFeed(), mkPythFeed());
    expect(agg.getPrice('UNKNOWN')).toBeNull();
  });

  test('start() calls connect on both feeds', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);
    expect(hl.connect).toHaveBeenCalled();
    expect(pyth.connect).toHaveBeenCalled();
    agg.stop();
  });
});

// ─── Single-source price ──────────────────────────────────────────────────────

describe('OracleAggregator — single source', () => {
  test('mark price equals Pyth price when only Pyth is available', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    sendPythPrice(pyth, 'BTC-USD', '50000');
    await tick(agg);

    expect(agg.getMarkPrice('BTC-USD')).toBe('50000');
    agg.stop();
  });

  test('mark price equals HL price when only HL is available', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    sendHlMids(hl, { BTC: '49000' });
    await tick(agg);

    expect(agg.getMarkPrice('BTC-USD')).toBe('49000');
    agg.stop();
  });

  test('mark price equals Chainlink price when only Chainlink is available', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    agg.setChainlinkPrice('BTC-USD', '51000');
    await tick(agg);

    expect(agg.getMarkPrice('BTC-USD')).toBe('51000');
    agg.stop();
  });
});

// ─── Multi-source median ──────────────────────────────────────────────────────

describe('OracleAggregator — median (multi-source)', () => {
  test('median of two prices is their average', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    sendPythPrice(pyth, 'BTC-USD', '50000');
    sendHlMids(hl, { BTC: '52000' });
    await tick(agg);

    const mark = parseFloat(agg.getMarkPrice('BTC-USD')!);
    expect(mark).toBeCloseTo(51000, 0);
    agg.stop();
  });

  test('median of three prices selects the middle value', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    sendPythPrice(pyth, 'BTC-USD', '50000');
    sendHlMids(hl, { BTC: '49000' });
    agg.setChainlinkPrice('BTC-USD', '55000');
    await tick(agg);

    // Sorted: [49000, 50000, 55000] → median = 50000
    const mark = parseFloat(agg.getMarkPrice('BTC-USD')!);
    expect(mark).toBeCloseTo(50000, 0);
    agg.stop();
  });

  test('median is resistant to one outlier', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['ETH-USD']);

    // HL has wildly wrong price; Pyth + Chainlink agree around 3000
    sendPythPrice(pyth, 'ETH-USD', '3000');
    sendHlMids(hl, { ETH: '3010' });
    agg.setChainlinkPrice('ETH-USD', '1000000'); // outlier
    await tick(agg);

    // Sorted: [3000, 3010, 1000000] → median = 3010
    const mark = parseFloat(agg.getMarkPrice('ETH-USD')!);
    expect(mark).toBeCloseTo(3010, 0);
    agg.stop();
  });
});

// ─── Funding rate calculation ─────────────────────────────────────────────────

describe('OracleAggregator — funding rate', () => {
  test('funding rate is zero when mark == index', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    sendPythPrice(pyth, 'BTC-USD', '50000');
    await tick(agg);

    const price = agg.getPrice('BTC-USD')!;
    expect(parseFloat(price.fundingRate)).toBeCloseTo(0, 8);
    agg.stop();
  });

  test('positive funding rate when mark > index', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    // Pyth (index) = 50000, HL = 52000 → mark = 51000 > index
    sendPythPrice(pyth, 'BTC-USD', '50000');
    sendHlMids(hl, { BTC: '52000' });
    await tick(agg);

    const price = agg.getPrice('BTC-USD')!;
    expect(parseFloat(price.fundingRate)).toBeGreaterThan(0);
    agg.stop();
  });

  test('negative funding rate when mark < index', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    // Pyth (index) = 52000, HL = 48000 → mark = 50000 < index
    sendPythPrice(pyth, 'BTC-USD', '52000');
    sendHlMids(hl, { BTC: '48000' });
    await tick(agg);

    const price = agg.getPrice('BTC-USD')!;
    expect(parseFloat(price.fundingRate)).toBeLessThan(0);
    agg.stop();
  });

  test('funding rate is capped at ±0.1% per hour', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    // Extreme divergence: Pyth=50000, HL=1 → massive negative funding
    sendPythPrice(pyth, 'BTC-USD', '50000');
    sendHlMids(hl, { BTC: '1' });
    await tick(agg);

    const price = agg.getPrice('BTC-USD')!;
    const rate = parseFloat(price.fundingRate);
    expect(Math.abs(rate)).toBeLessThanOrEqual(0.001 + 1e-9); // 0.1% cap
    agg.stop();
  });
});

// ─── Chainlink price injection ────────────────────────────────────────────────

describe('OracleAggregator — setChainlinkPrice', () => {
  test('setChainlinkPrice is reflected in price sources', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    agg.setChainlinkPrice('BTC-USD', '48000');
    await tick(agg);

    const price = agg.getPrice('BTC-USD')!;
    expect(price.sources.chainlink).toBe('48000');
    agg.stop();
  });

  test('overwriting chainlink price uses latest value', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    agg.setChainlinkPrice('BTC-USD', '48000');
    agg.setChainlinkPrice('BTC-USD', '49500');
    await tick(agg);

    const price = agg.getPrice('BTC-USD')!;
    expect(price.sources.chainlink).toBe('49500');
    agg.stop();
  });
});

// ─── Stale detection ──────────────────────────────────────────────────────────

describe('OracleAggregator — stale detection', () => {
  test('price is stale when all sources exceed MAX_STALENESS', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    // Inject stale price by backdating the timestamp
    (agg as any).pythPrices.set('BTC-USD', { price: '50000', ts: Date.now() - 120_000 });
    await tick(agg);

    // No fresh sources → price object unchanged or stale=true
    const price = agg.getPrice('BTC-USD');
    if (price) {
      expect(price.stale).toBe(true);
    } else {
      expect(price).toBeNull(); // acceptable if nothing was set yet
    }
    agg.stop();
  });

  test('fresh price is not stale', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    sendPythPrice(pyth, 'BTC-USD', '50000');
    await tick(agg);

    expect(agg.getPrice('BTC-USD')?.stale).toBe(false);
    agg.stop();
  });
});

// ─── getIndexPrice ────────────────────────────────────────────────────────────

describe('OracleAggregator — getIndexPrice', () => {
  test('index price equals Pyth when available', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    sendPythPrice(pyth, 'BTC-USD', '50000');
    sendHlMids(hl, { BTC: '51000' });
    await tick(agg);

    expect(agg.getIndexPrice('BTC-USD')).toBe('50000');
    agg.stop();
  });

  test('index price falls back to HL when Pyth absent', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    sendHlMids(hl, { BTC: '49000' });
    await tick(agg);

    expect(agg.getIndexPrice('BTC-USD')).toBe('49000');
    agg.stop();
  });
});

// ─── Multi-market ─────────────────────────────────────────────────────────────

describe('OracleAggregator — multi-market', () => {
  test('prices are tracked independently for each market', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD', 'ETH-USD']);

    sendPythPrice(pyth, 'BTC-USD', '50000');
    sendPythPrice(pyth, 'ETH-USD', '3000');
    await tick(agg);

    expect(agg.getMarkPrice('BTC-USD')).toBe('50000');
    expect(agg.getMarkPrice('ETH-USD')).toBe('3000');
    agg.stop();
  });

  test('HL allMids update populates multiple markets', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD', 'ETH-USD', 'SOL-USD']);

    sendHlMids(hl, { BTC: '50000', ETH: '3000', SOL: '150' });
    await tick(agg);

    expect(agg.getMarkPrice('BTC-USD')).toBe('50000');
    expect(agg.getMarkPrice('ETH-USD')).toBe('3000');
    expect(agg.getMarkPrice('SOL-USD')).toBe('150');
    agg.stop();
  });
});

// ─── Event emission ───────────────────────────────────────────────────────────

describe('OracleAggregator — events', () => {
  test('emits "price" event after aggregation', async () => {
    const hl = mkHlFeed();
    const pyth = mkPythFeed();
    const agg = new OracleAggregator(hl, pyth);
    await agg.start(['BTC-USD']);

    const priceEvents: any[] = [];
    agg.on('price', (p) => priceEvents.push(p));

    sendPythPrice(pyth, 'BTC-USD', '50000');
    await tick(agg);

    expect(priceEvents.length).toBeGreaterThan(0);
    expect(priceEvents[0].market).toBe('BTC-USD');
    expect(priceEvents[0].markPrice).toBe('50000');
    agg.stop();
  });
});
