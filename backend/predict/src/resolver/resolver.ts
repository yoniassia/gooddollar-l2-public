// ============================================================
// GoodPredict Market Resolver Service
// ============================================================
// Manages market lifecycle: creation, resolution, voiding.
// Phase 1: Admin-only resolution
// Phase 2: Optimistic resolution with dispute period

import { v4 as uuid } from 'uuid';
import type { Market, MarketStatus } from '../types/index.js';

interface CreateMarketParams {
  question: string;
  category: string;
  endTime: number;    // Unix timestamp (seconds)
  resolver?: string;  // Address
}

export class MarketResolverService {
  private markets: Map<string, Market> = new Map();
  private adminAddress: string;
  private nextOnChainId = 0;

  constructor(adminAddress: string) {
    this.adminAddress = adminAddress;
  }

  /** Create a new market */
  createMarket(params: CreateMarketParams): Market {
    const { question, category, endTime, resolver } = params;

    if (!question.trim()) throw new Error('Question is required');
    if (endTime <= Date.now() / 1000) throw new Error('End time must be in the future');

    const market: Market = {
      id: uuid(),
      onChainId: this.nextOnChainId++,
      question: question.trim(),
      category,
      endTime,
      status: 'OPEN',
      resolver: resolver || this.adminAddress,
      totalYES: 0n,
      totalNO: 0n,
      collateral: 0n,
      tickSize: 0.01,
      createdAt: Date.now(),
    };

    this.markets.set(market.id, market);
    console.log(`[Resolver] Market created: ${market.id} — "${question}"`);
    return market;
  }

  /** Get a market by ID */
  getMarket(id: string): Market | undefined {
    return this.markets.get(id);
  }

  /** Get all markets */
  getAllMarkets(): Market[] {
    return Array.from(this.markets.values());
  }

  /** Get markets by status */
  getMarketsByStatus(status: MarketStatus): Market[] {
    return Array.from(this.markets.values()).filter(m => m.status === status);
  }

  /** Close a market (after end time, before resolution) */
  closeMarket(id: string): Market {
    const market = this.markets.get(id);
    if (!market) throw new Error('Market not found');
    if (market.status !== 'OPEN') throw new Error(`Market is ${market.status}, cannot close`);
    if (Date.now() / 1000 < market.endTime) throw new Error('Market has not reached end time');

    market.status = 'CLOSED';
    console.log(`[Resolver] Market closed: ${id}`);
    return market;
  }

  /** Resolve a market as YES or NO */
  resolveMarket(id: string, yesWon: boolean): Market {
    const market = this.markets.get(id);
    if (!market) throw new Error('Market not found');

    // Auto-close if still open and past end time
    if (market.status === 'OPEN' && Date.now() / 1000 >= market.endTime) {
      market.status = 'CLOSED';
    }

    if (market.status !== 'CLOSED') {
      throw new Error(`Market is ${market.status}, must be CLOSED to resolve`);
    }

    market.status = yesWon ? 'RESOLVED_YES' : 'RESOLVED_NO';
    console.log(`[Resolver] Market resolved: ${id} → ${market.status}`);
    return market;
  }

  /** Void a market (refund all participants) */
  voidMarket(id: string): Market {
    const market = this.markets.get(id);
    if (!market) throw new Error('Market not found');
    if (market.status !== 'OPEN' && market.status !== 'CLOSED') {
      throw new Error(`Market is ${market.status}, cannot void`);
    }

    market.status = 'VOIDED';
    console.log(`[Resolver] Market voided: ${id}`);
    return market;
  }

  /** Check and auto-close expired markets */
  checkExpiredMarkets(): Market[] {
    const now = Date.now() / 1000;
    const closed: Market[] = [];
    for (const market of this.markets.values()) {
      if (market.status === 'OPEN' && now >= market.endTime) {
        market.status = 'CLOSED';
        closed.push(market);
        console.log(`[Resolver] Auto-closed expired market: ${market.id}`);
      }
    }
    return closed;
  }

  // ============================================================
  // Phase 2: Optimistic Resolution (TODO)
  // ============================================================

  /**
   * Phase 2 will add:
   * - proposeResolution(marketId, outcome, bond) — anyone can propose
   * - disputeResolution(marketId, bond) — anyone can dispute within 24h
   * - finalizeResolution(marketId) — auto-accept after dispute period
   * - Bond management (G$ staking for proposals/disputes)
   */
}
