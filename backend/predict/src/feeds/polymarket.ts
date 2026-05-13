// ============================================================
// Polymarket Price Feed Integration
// ============================================================
// Polls Polymarket CLOB API for reference prices on linked markets.
// Used for price comparison display and arbitrage detection.

import type { PriceFeed } from '../types/index.js';

const CLOB_BASE = 'https://clob.polymarket.com';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';

interface PolymarketBook {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  hash: string;
  timestamp: string;
}

interface PolymarketMidpoint {
  mid: string;
}

interface PolymarketMarket {
  id: string;
  condition_id: string;
  question: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
  active: boolean;
  closed: boolean;
  volume: string;
  liquidity: string;
}

export class PolymarketFeed {
  private feeds: Map<string, PriceFeed> = new Map();
  private linkedMarkets: Map<string, { yesTokenId: string; noTokenId: string }> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;

  constructor(pollIntervalMs = 5000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  /** Link a GoodPredict market to a Polymarket token pair */
  linkMarket(marketId: string, yesTokenId: string, noTokenId: string): void {
    this.linkedMarkets.set(marketId, { yesTokenId, noTokenId });
    console.log(`[PolymarketFeed] Linked market ${marketId} → YES:${yesTokenId.slice(0, 12)}... NO:${noTokenId.slice(0, 12)}...`);
  }

  /** Unlink a market */
  unlinkMarket(marketId: string): void {
    this.linkedMarkets.delete(marketId);
    this.feeds.delete(marketId);
  }

  /** Start polling */
  start(): void {
    if (this.pollInterval) return;
    console.log(`[PolymarketFeed] Starting price feed polling every ${this.pollIntervalMs}ms`);
    this.pollInterval = setInterval(() => this.pollAll(), this.pollIntervalMs);
    // Initial poll
    this.pollAll().catch(err => console.error('[PolymarketFeed] Initial poll error:', err));
  }

  /** Stop polling */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[PolymarketFeed] Stopped');
    }
  }

  /** Get latest feed for a market */
  getFeed(marketId: string): PriceFeed | undefined {
    return this.feeds.get(marketId);
  }

  /** Get all feeds */
  getAllFeeds(): PriceFeed[] {
    return Array.from(this.feeds.values());
  }

  /** Search Polymarket for a question and return matching markets */
  async searchMarkets(query: string): Promise<PolymarketMarket[]> {
    try {
      const url = `${GAMMA_BASE}/markets?search=${encodeURIComponent(query)}&limit=10&active=true`;
      const resp = await fetch(url);
      if (!resp.ok) return [];
      return await resp.json() as PolymarketMarket[];
    } catch (err) {
      console.error('[PolymarketFeed] Search error:', err);
      return [];
    }
  }

  // ============================================================
  // Private
  // ============================================================

  private async pollAll(): Promise<void> {
    const promises = Array.from(this.linkedMarkets.entries()).map(
      ([marketId, tokens]) => this.pollMarket(marketId, tokens).catch(err => {
        console.error(`[PolymarketFeed] Error polling ${marketId}:`, err);
      })
    );
    await Promise.allSettled(promises);
  }

  private async pollMarket(
    marketId: string,
    tokens: { yesTokenId: string; noTokenId: string }
  ): Promise<void> {
    // Fetch midpoints for YES and NO
    const [yesMid, noMid] = await Promise.all([
      this.fetchMidpoint(tokens.yesTokenId),
      this.fetchMidpoint(tokens.noTokenId),
    ]);

    // Fetch spreads
    const [yesBook, noBook] = await Promise.all([
      this.fetchBook(tokens.yesTokenId),
      this.fetchBook(tokens.noTokenId),
    ]);

    const yesSpread = this.calcSpread(yesBook);
    const noSpread = this.calcSpread(noBook);

    const feed: PriceFeed = {
      marketId,
      source: 'polymarket',
      yesMidpoint: yesMid ?? 0.5,
      noMidpoint: noMid ?? 0.5,
      yesSpread,
      noSpread,
      updatedAt: Date.now(),
    };

    this.feeds.set(marketId, feed);
  }

  private async fetchMidpoint(tokenId: string): Promise<number | null> {
    try {
      const resp = await fetch(`${CLOB_BASE}/midpoint?token_id=${tokenId}`);
      if (!resp.ok) return null;
      const data = await resp.json() as PolymarketMidpoint;
      return parseFloat(data.mid);
    } catch {
      return null;
    }
  }

  private async fetchBook(tokenId: string): Promise<PolymarketBook | null> {
    try {
      const resp = await fetch(`${CLOB_BASE}/book?token_id=${tokenId}`);
      if (!resp.ok) return null;
      return await resp.json() as PolymarketBook;
    } catch {
      return null;
    }
  }

  private calcSpread(book: PolymarketBook | null): number {
    if (!book || book.bids.length === 0 || book.asks.length === 0) return 1;
    const bestBid = parseFloat(book.bids[0].price);
    const bestAsk = parseFloat(book.asks[0].price);
    return bestAsk - bestBid;
  }
}
