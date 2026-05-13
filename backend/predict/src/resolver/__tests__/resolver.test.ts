// ============================================================
// MarketResolverService unit tests — GoodPredict
//
// Covers: market creation, status transitions (OPEN → CLOSED →
// RESOLVED_YES/NO / VOIDED), expiry auto-close, validation, and
// query helpers.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketResolverService } from '../resolver.js';

const ADMIN = '0xAdminAddress';

// Future end time (10 minutes from now)
function futureEnd(offsetSec = 600) {
  return Math.floor(Date.now() / 1000) + offsetSec;
}

// Past end time
function pastEnd(offsetSec = 600) {
  return Math.floor(Date.now() / 1000) - offsetSec;
}

// ─── Creation ────────────────────────────────────────────────────────────────

describe('MarketResolverService — creation', () => {
  let resolver: MarketResolverService;
  beforeEach(() => { resolver = new MarketResolverService(ADMIN); });

  it('creates a market and returns it', () => {
    const market = resolver.createMarket({
      question: 'Will BTC hit $200k by 2026?',
      category: 'Crypto',
      endTime: futureEnd(),
    });

    expect(market.id).toBeDefined();
    expect(market.question).toBe('Will BTC hit $200k by 2026?');
    expect(market.status).toBe('OPEN');
    expect(market.category).toBe('Crypto');
  });

  it('assigns incrementing onChainId', () => {
    const m1 = resolver.createMarket({ question: 'Q1', category: 'A', endTime: futureEnd() });
    const m2 = resolver.createMarket({ question: 'Q2', category: 'A', endTime: futureEnd() });
    expect(m2.onChainId).toBe(m1.onChainId + 1);
  });

  it('uses admin address as default resolver', () => {
    const market = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    expect(market.resolver).toBe(ADMIN);
  });

  it('accepts a custom resolver address', () => {
    const customResolver = '0xCustomResolver';
    const market = resolver.createMarket({
      question: 'Q',
      category: 'A',
      endTime: futureEnd(),
      resolver: customResolver,
    });
    expect(market.resolver).toBe(customResolver);
  });

  it('rejects empty question', () => {
    expect(() => resolver.createMarket({ question: '  ', category: 'A', endTime: futureEnd() }))
      .toThrow('Question is required');
  });

  it('rejects end time in the past', () => {
    expect(() => resolver.createMarket({ question: 'Q', category: 'A', endTime: pastEnd() }))
      .toThrow('End time must be in the future');
  });

  it('trims whitespace from question', () => {
    const market = resolver.createMarket({ question: '  Is it YES?  ', category: 'A', endTime: futureEnd() });
    expect(market.question).toBe('Is it YES?');
  });
});

// ─── Queries ─────────────────────────────────────────────────────────────────

describe('MarketResolverService — queries', () => {
  let resolver: MarketResolverService;
  beforeEach(() => { resolver = new MarketResolverService(ADMIN); });

  it('getMarket returns created market', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    expect(resolver.getMarket(m.id)).toBe(m);
  });

  it('getMarket returns undefined for unknown id', () => {
    expect(resolver.getMarket('no-such-id')).toBeUndefined();
  });

  it('getAllMarkets returns all markets', () => {
    resolver.createMarket({ question: 'Q1', category: 'A', endTime: futureEnd() });
    resolver.createMarket({ question: 'Q2', category: 'A', endTime: futureEnd() });
    expect(resolver.getAllMarkets()).toHaveLength(2);
  });

  it('getMarketsByStatus filters correctly', () => {
    resolver.createMarket({ question: 'Q1', category: 'A', endTime: futureEnd() }); // OPEN
    resolver.createMarket({ question: 'Q2', category: 'A', endTime: futureEnd() }); // OPEN

    expect(resolver.getMarketsByStatus('OPEN')).toHaveLength(2);
    expect(resolver.getMarketsByStatus('CLOSED')).toHaveLength(0);
  });
});

// ─── Close ───────────────────────────────────────────────────────────────────

describe('MarketResolverService — closeMarket', () => {
  let resolver: MarketResolverService;
  beforeEach(() => { resolver = new MarketResolverService(ADMIN); });

  it('closes a market past its end time', () => {
    // Create market with end time in the past (simulating an expired market)
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    // Manually set endTime to past so closeMarket passes the time check
    (m as any).endTime = pastEnd();

    const closed = resolver.closeMarket(m.id);
    expect(closed.status).toBe('CLOSED');
  });

  it('throws when closing a market that has not reached end time', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    expect(() => resolver.closeMarket(m.id)).toThrow('Market has not reached end time');
  });

  it('throws when closing unknown market', () => {
    expect(() => resolver.closeMarket('no-such-id')).toThrow('Market not found');
  });

  it('throws when closing already-closed market', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    (m as any).endTime = pastEnd();
    resolver.closeMarket(m.id);
    expect(() => resolver.closeMarket(m.id)).toThrow();
  });
});

// ─── Resolve ──────────────────────────────────────────────────────────────────

describe('MarketResolverService — resolveMarket', () => {
  let resolver: MarketResolverService;

  function mkClosedMarket() {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    (m as any).endTime = pastEnd();
    resolver.closeMarket(m.id);
    return m;
  }

  beforeEach(() => { resolver = new MarketResolverService(ADMIN); });

  it('resolves CLOSED market as YES', () => {
    const m = mkClosedMarket();
    const resolved = resolver.resolveMarket(m.id, true);
    expect(resolved.status).toBe('RESOLVED_YES');
  });

  it('resolves CLOSED market as NO', () => {
    const m = mkClosedMarket();
    const resolved = resolver.resolveMarket(m.id, false);
    expect(resolved.status).toBe('RESOLVED_NO');
  });

  it('auto-closes OPEN market past end time on resolve', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    (m as any).endTime = pastEnd(); // Move end time to past without calling closeMarket

    const resolved = resolver.resolveMarket(m.id, true);
    expect(resolved.status).toBe('RESOLVED_YES');
  });

  it('throws when resolving OPEN market not yet past end time', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    expect(() => resolver.resolveMarket(m.id, true)).toThrow();
  });

  it('throws when resolving already-resolved market', () => {
    const m = mkClosedMarket();
    resolver.resolveMarket(m.id, true);
    expect(() => resolver.resolveMarket(m.id, false)).toThrow();
  });

  it('throws when resolving unknown market', () => {
    expect(() => resolver.resolveMarket('no-such-id', true)).toThrow('Market not found');
  });
});

// ─── Void ─────────────────────────────────────────────────────────────────────

describe('MarketResolverService — voidMarket', () => {
  let resolver: MarketResolverService;
  beforeEach(() => { resolver = new MarketResolverService(ADMIN); });

  it('voids an OPEN market', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    const voided = resolver.voidMarket(m.id);
    expect(voided.status).toBe('VOIDED');
  });

  it('voids a CLOSED market', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    (m as any).endTime = pastEnd();
    resolver.closeMarket(m.id);
    const voided = resolver.voidMarket(m.id);
    expect(voided.status).toBe('VOIDED');
  });

  it('throws when voiding a RESOLVED market', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    (m as any).endTime = pastEnd();
    resolver.resolveMarket(m.id, true);
    expect(() => resolver.voidMarket(m.id)).toThrow();
  });

  it('throws when voiding unknown market', () => {
    expect(() => resolver.voidMarket('no-such-id')).toThrow('Market not found');
  });
});

// ─── Auto-expiry ──────────────────────────────────────────────────────────────

describe('MarketResolverService — checkExpiredMarkets', () => {
  let resolver: MarketResolverService;
  beforeEach(() => { resolver = new MarketResolverService(ADMIN); });

  it('auto-closes expired markets', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    (m as any).endTime = pastEnd(); // Back-date

    const closed = resolver.checkExpiredMarkets();
    expect(closed).toHaveLength(1);
    expect(closed[0].id).toBe(m.id);
    expect(closed[0].status).toBe('CLOSED');
  });

  it('does not close markets that have not expired', () => {
    resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    const closed = resolver.checkExpiredMarkets();
    expect(closed).toHaveLength(0);
  });

  it('does not auto-close already-closed markets', () => {
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });
    (m as any).endTime = pastEnd();
    resolver.closeMarket(m.id); // Already closed

    const closed = resolver.checkExpiredMarkets();
    expect(closed).toHaveLength(0);
  });

  it('handles mix of expired and active markets', () => {
    const active = resolver.createMarket({ question: 'Active', category: 'A', endTime: futureEnd() });
    const expired1 = resolver.createMarket({ question: 'Exp1', category: 'A', endTime: futureEnd() });
    const expired2 = resolver.createMarket({ question: 'Exp2', category: 'A', endTime: futureEnd() });

    (expired1 as any).endTime = pastEnd();
    (expired2 as any).endTime = pastEnd();

    const closed = resolver.checkExpiredMarkets();
    expect(closed).toHaveLength(2);
    expect(resolver.getMarket(active.id)!.status).toBe('OPEN');
  });
});

// ─── Status filtering ─────────────────────────────────────────────────────────

describe('MarketResolverService — status lifecycle', () => {
  it('full lifecycle: OPEN → CLOSED → RESOLVED_YES', () => {
    const resolver = new MarketResolverService(ADMIN);
    const m = resolver.createMarket({ question: 'Q', category: 'A', endTime: futureEnd() });

    expect(resolver.getMarketsByStatus('OPEN')).toHaveLength(1);
    expect(resolver.getMarketsByStatus('CLOSED')).toHaveLength(0);

    (m as any).endTime = pastEnd();
    resolver.closeMarket(m.id);

    expect(resolver.getMarketsByStatus('OPEN')).toHaveLength(0);
    expect(resolver.getMarketsByStatus('CLOSED')).toHaveLength(1);

    resolver.resolveMarket(m.id, true);

    expect(resolver.getMarketsByStatus('CLOSED')).toHaveLength(0);
    expect(resolver.getMarketsByStatus('RESOLVED_YES')).toHaveLength(1);
  });
});
