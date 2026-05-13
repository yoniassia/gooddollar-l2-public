// ============================================================
// GoodPredict REST API Routes
// ============================================================
// Express routes for market management, order placement,
// and data queries.

import { Router, type Request, type Response } from 'express';
import { OrderBookEngine } from '../engine/orderbook.js';
import { PolymarketFeed } from '../feeds/polymarket.js';
import { MarketResolverService } from '../resolver/resolver.js';
import type { OutcomeToken, Side, Market, MarketStatus } from '../types/index.js';

export function createRoutes(
  engine: OrderBookEngine,
  feed: PolymarketFeed,
  resolver: MarketResolverService,
): Router {
  const router = Router();

  // ============================================================
  // Markets
  // ============================================================

  /** List all markets */
  router.get('/markets', (_req: Request, res: Response) => {
    const markets = resolver.getAllMarkets();
    res.json({ markets });
  });

  /** Get a single market */
  router.get('/markets/:id', (req: Request, res: Response) => {
    const market = resolver.getMarket(req.params.id);
    if (!market) return res.status(404).json({ error: 'Market not found' });

    // Include price data
    const yesBook = engine.getOrderBook(req.params.id, 'YES');
    const noBook = engine.getOrderBook(req.params.id, 'NO');
    const polyFeed = feed.getFeed(req.params.id);

    res.json({
      market,
      orderbooks: { yes: yesBook, no: noBook },
      polymarketFeed: polyFeed || null,
    });
  });

  /** Create a new market */
  router.post('/markets', (req: Request, res: Response) => {
    try {
      const { question, category, endTime, resolver: resolverAddr, polymarketYesTokenId, polymarketNoTokenId } = req.body;

      if (!question || !endTime) {
        return res.status(400).json({ error: 'question and endTime are required' });
      }

      const market = resolver.createMarket({
        question,
        category: category || 'General',
        endTime: typeof endTime === 'string' ? new Date(endTime).getTime() / 1000 : endTime,
        resolver: resolverAddr,
      });

      // Initialize order books
      engine.initMarket(market.id);

      // Link to Polymarket if tokens provided
      if (polymarketYesTokenId && polymarketNoTokenId) {
        feed.linkMarket(market.id, polymarketYesTokenId, polymarketNoTokenId);
      }

      res.status(201).json({ market });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** Resolve a market */
  router.post('/markets/:id/resolve', (req: Request, res: Response) => {
    try {
      const { outcome } = req.body; // 'YES' | 'NO'
      if (!outcome || !['YES', 'NO'].includes(outcome)) {
        return res.status(400).json({ error: 'outcome must be YES or NO' });
      }
      resolver.resolveMarket(req.params.id, outcome === 'YES');
      res.json({ success: true, status: outcome === 'YES' ? 'RESOLVED_YES' : 'RESOLVED_NO' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** Void a market */
  router.post('/markets/:id/void', (req: Request, res: Response) => {
    try {
      resolver.voidMarket(req.params.id);
      res.json({ success: true, status: 'VOIDED' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ============================================================
  // Order Book
  // ============================================================

  /** Get order book for a market token */
  router.get('/orderbook/:marketId/:token', (req: Request, res: Response) => {
    const { marketId, token } = req.params;
    if (!['YES', 'NO'].includes(token.toUpperCase())) {
      return res.status(400).json({ error: 'token must be YES or NO' });
    }

    const book = engine.getOrderBook(marketId, token.toUpperCase() as OutcomeToken);
    if (!book) return res.status(404).json({ error: 'Order book not found' });
    res.json(book);
  });

  /** Get midpoint price */
  router.get('/midpoint/:marketId/:token', (req: Request, res: Response) => {
    const { marketId, token } = req.params;
    const mid = engine.getMidpoint(marketId, token.toUpperCase() as OutcomeToken);
    res.json({ marketId, token: token.toUpperCase(), midpoint: mid ?? null });
  });

  // ============================================================
  // Orders
  // ============================================================

  /** Place an order */
  router.post('/orders', (req: Request, res: Response) => {
    try {
      const { marketId, token, side, price, size, maker, type } = req.body;

      if (!marketId || !token || !side || price == null || !size || !maker) {
        return res.status(400).json({
          error: 'Required fields: marketId, token, side, price, size, maker'
        });
      }

      // Validate market is open
      const market = resolver.getMarket(marketId);
      if (!market) return res.status(404).json({ error: 'Market not found' });
      if (market.status !== 'OPEN') {
        return res.status(400).json({ error: `Market is ${market.status}, cannot trade` });
      }

      const result = engine.placeOrder({
        marketId,
        token: (token as string).toUpperCase() as OutcomeToken,
        side: (side as string).toUpperCase() as Side,
        price: Number(price),
        size: Number(size),
        maker,
        type: type?.toUpperCase() || 'GTC',
      });

      res.status(201).json({
        order: result.remainingOrder,
        trades: result.trades,
        filled: result.trades.reduce((sum, t) => sum + t.size, 0),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** Cancel an order */
  router.delete('/orders/:id', (req: Request, res: Response) => {
    const order = engine.cancelOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found or already filled/cancelled' });
    res.json({ order });
  });

  /** Get order by ID */
  router.get('/orders/:id', (req: Request, res: Response) => {
    const order = engine.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  });

  /** Get all open orders for a maker */
  router.get('/orders/maker/:address', (req: Request, res: Response) => {
    const orders = engine.getOrdersByMaker(req.params.address);
    res.json({ orders });
  });

  // ============================================================
  // Price Feeds
  // ============================================================

  /** Get Polymarket price feed for a market */
  router.get('/feeds/:marketId', (req: Request, res: Response) => {
    const priceFeed = feed.getFeed(req.params.marketId);
    if (!priceFeed) return res.status(404).json({ error: 'No price feed for this market' });
    res.json(priceFeed);
  });

  /** Get all price feeds */
  router.get('/feeds', (_req: Request, res: Response) => {
    res.json({ feeds: feed.getAllFeeds() });
  });

  /** Search Polymarket for a question */
  router.get('/feeds/search', async (req: Request, res: Response) => {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ error: 'Query parameter q is required' });
    const results = await feed.searchMarkets(query);
    res.json({ results });
  });

  /** Link a market to Polymarket tokens */
  router.post('/feeds/:marketId/link', (req: Request, res: Response) => {
    const { yesTokenId, noTokenId } = req.body;
    if (!yesTokenId || !noTokenId) {
      return res.status(400).json({ error: 'yesTokenId and noTokenId are required' });
    }
    feed.linkMarket(req.params.marketId, yesTokenId, noTokenId);
    res.json({ success: true });
  });

  // ============================================================
  // Stats
  // ============================================================

  router.get('/stats', (_req: Request, res: Response) => {
    const markets = resolver.getAllMarkets();
    res.json({
      totalMarkets: markets.length,
      openMarkets: markets.filter(m => m.status === 'OPEN').length,
      resolvedMarkets: markets.filter(m => m.status.startsWith('RESOLVED')).length,
      feeds: feed.getAllFeeds().length,
    });
  });

  return router;
}
