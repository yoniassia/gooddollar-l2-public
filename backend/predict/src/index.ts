// ============================================================
// GoodPredict Backend — Entry Point
// ============================================================
// Starts the HTTP server, WebSocket server, CLOB engine,
// Polymarket feed, contract interaction, and market resolver.

import express from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { OrderBookEngine } from './engine/orderbook.js';
import { PolymarketFeed } from './feeds/polymarket.js';
import { PredictWebSocketServer } from './api/websocket.js';
import { MarketResolverService } from './resolver/resolver.js';
import { PredictContractInteraction, type PredictContractAddresses } from './contracts/ContractInteraction.js';
import { createRoutes } from './api/routes.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3040', 10);
const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || '0x0000000000000000000000000000000000000000';
const POLYMARKET_POLL_MS = parseInt(process.env.POLYMARKET_POLL_MS || '5000', 10);

// Chain config
const RPC_URL = process.env.L2_RPC_URL || 'http://localhost:8545';
const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY || '';

const CONTRACT_ADDRESSES: PredictContractAddresses = {
  marketFactory: process.env.MARKET_FACTORY_ADDRESS || '',
  conditionalTokens: process.env.CONDITIONAL_TOKENS_ADDRESS || '',
  goodDollar: process.env.GOOD_DOLLAR_ADDRESS || '',
  ubiFeeSplitter: process.env.UBI_FEE_SPLITTER_ADDRESS || '',
};

async function main() {
  console.log('==============================================');
  console.log('  GoodPredict Backend v0.2.0');
  console.log('  Prediction Markets on GoodDollar L2');
  console.log('  Now with on-chain settlement!');
  console.log('==============================================\n');

  // Initialize services
  const resolver = new MarketResolverService(ADMIN_ADDRESS);
  const polyFeed = new PolymarketFeed(POLYMARKET_POLL_MS);

  // Initialize contract interaction
  let contracts: PredictContractInteraction | null = null;
  if (OPERATOR_KEY && CONTRACT_ADDRESSES.marketFactory) {
    try {
      contracts = new PredictContractInteraction(RPC_URL, OPERATOR_KEY, CONTRACT_ADDRESSES);
      await contracts.init();

      // Sync existing on-chain markets
      const onChainMarkets = await contracts.syncMarkets();
      for (const m of onChainMarkets) {
        // Create in-memory market entries for on-chain markets
        console.log(`[Sync] Market #${m.marketId}: "${m.question}" (status: ${m.status})`);
      }
      console.log(`[Contracts] Connected to chain at ${RPC_URL}`);
    } catch (err: any) {
      console.warn(`[Contracts] Failed to initialize: ${err.message}`);
      console.warn('[Contracts] Running in paper-trading mode (no on-chain settlement)');
      contracts = null;
    }
  } else {
    console.warn('[Contracts] No OPERATOR_PRIVATE_KEY or contract addresses — paper-trading mode');
  }

  // Initialize CLOB engine with WebSocket broadcasting
  let wsServer: PredictWebSocketServer;

  const engine = new OrderBookEngine({
    onTrade: (trade) => {
      console.log(`[Trade] ${trade.token} ${trade.size}@${trade.price} in market ${trade.marketId}`);
      wsServer?.broadcastTrade(trade);

      // Broadcast updated orderbooks
      const yesBook = engine.getOrderBook(trade.marketId, 'YES');
      const noBook = engine.getOrderBook(trade.marketId, 'NO');
      if (yesBook) wsServer?.broadcastOrderBook(yesBook);
      if (noBook) wsServer?.broadcastOrderBook(noBook);

      // On-chain settlement: execute buy for matched trades
      if (contracts) {
        const onChainMarket = resolver.getMarket(trade.marketId);
        if (onChainMarket && onChainMarket.onChainId >= 0) {
          contracts.settleBuy(
            onChainMarket.onChainId,
            trade.token === 'YES',
            trade.size.toString(),
            trade.taker,
          ).then((result) => {
            trade.status = 'CONFIRMED';
            trade.txHash = result.txHash;
            console.log(`[Settlement] Trade ${trade.id} confirmed: ${result.txHash}`);
          }).catch((err) => {
            trade.status = 'FAILED';
            console.error(`[Settlement] Trade ${trade.id} failed:`, err.message);
          });
        }
      }
    },
    onOrderUpdate: (order) => {
      wsServer?.broadcastOrderUpdate(order);
    },
  });

  // Listen for on-chain events (if connected)
  if (contracts) {
    contracts.onMarketCreated((marketId, question, endTime) => {
      console.log(`[Chain Event] MarketCreated #${marketId}: "${question}"`);
    });

    contracts.onBought((marketId, buyer, isYES, amount) => {
      console.log(`[Chain Event] Bought: market=${marketId}, ${isYES ? 'YES' : 'NO'}, amount=${amount}, buyer=${buyer}`);
    });

    contracts.onMarketResolved((marketId, status) => {
      console.log(`[Chain Event] MarketResolved #${marketId}: ${status}`);
      // Broadcast to WebSocket clients
      wsServer?.broadcastMarketUpdate(marketId.toString(), {
        status,
        message: `Market resolved: ${status}`,
      });
    });
  }

  // Create Express app
  const app = express();
  app.use(express.json());

  // CORS
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'goodpredict',
      version: '0.2.0',
      uptime: process.uptime(),
      onChain: !!contracts,
      rpcUrl: contracts ? RPC_URL : null,
      timestamp: Date.now(),
    });
  });

  // On-chain data endpoints
  if (contracts) {
    app.get('/api/v1/chain/market/:marketId', async (req, res) => {
      try {
        const data = await contracts!.getMarket(parseInt(req.params.marketId));
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/v1/chain/markets', async (_req, res) => {
      try {
        const data = await contracts!.syncMarkets();
        res.json({ markets: data });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/v1/chain/balance/:address/:marketId/:token', async (req, res) => {
      try {
        const isYES = req.params.token.toUpperCase() === 'YES';
        const balance = await contracts!.getTokenBalance(
          req.params.address,
          parseInt(req.params.marketId),
          isYES,
        );
        res.json({
          address: req.params.address,
          marketId: parseInt(req.params.marketId),
          token: isYES ? 'YES' : 'NO',
          balance,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Create market on-chain + in memory
    app.post('/api/v1/chain/markets', async (req, res) => {
      try {
        const { question, category, endTime, resolver: resolverAddr } = req.body;
        if (!question || !endTime) {
          return res.status(400).json({ error: 'question and endTime are required' });
        }

        const endTimeSec = typeof endTime === 'string'
          ? Math.floor(new Date(endTime).getTime() / 1000)
          : endTime;

        // Create on-chain first
        const { txHash, marketId: onChainId } = await contracts!.createMarket(
          question,
          endTimeSec,
          resolverAddr,
        );

        // Then create in-memory
        const market = resolver.createMarket({
          question,
          category: category || 'General',
          endTime: endTimeSec,
          resolver: resolverAddr,
        });

        // Initialize CLOB books
        engine.initMarket(market.id);

        res.status(201).json({
          market,
          onChainId,
          txHash,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Resolve market on-chain
    app.post('/api/v1/chain/markets/:id/resolve', async (req, res) => {
      try {
        const market = resolver.getMarket(req.params.id);
        if (!market) return res.status(404).json({ error: 'Market not found' });

        const { outcome } = req.body;
        if (!outcome || !['YES', 'NO'].includes(outcome)) {
          return res.status(400).json({ error: 'outcome must be YES or NO' });
        }

        // Close + resolve on-chain
        try { await contracts!.closeMarket(market.onChainId); } catch { /* may already be closed */ }
        const txHash = await contracts!.resolveMarket(market.onChainId, outcome === 'YES');

        // Update in-memory
        resolver.resolveMarket(req.params.id, outcome === 'YES');

        res.json({ success: true, txHash, status: outcome === 'YES' ? 'RESOLVED_YES' : 'RESOLVED_NO' });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  // API routes (existing off-chain routes)
  app.use('/api/v1', createRoutes(engine, polyFeed, resolver));

  // Create HTTP server
  const server = createServer(app);

  // Initialize WebSocket server
  wsServer = new PredictWebSocketServer(server);

  // Start Polymarket feed
  polyFeed.start();

  // Periodic market expiry check (every 60s)
  setInterval(() => {
    const closed = resolver.checkExpiredMarkets();
    for (const market of closed) {
      wsServer.broadcastMarketUpdate(market.id, {
        status: 'CLOSED',
        message: 'Market expired and closed for trading',
      });

      // Also close on-chain if connected
      if (contracts && market.onChainId >= 0) {
        contracts.closeMarket(market.onChainId).catch((err) => {
          console.error(`[Chain] Failed to close market ${market.onChainId}:`, err.message);
        });
      }
    }
  }, 60_000);

  // Start server
  server.listen(PORT, () => {
    console.log(`[Server] HTTP + WebSocket listening on port ${PORT}`);
    console.log(`[Server] REST API:    http://localhost:${PORT}/api/v1`);
    console.log(`[Server] Chain API:   http://localhost:${PORT}/api/v1/chain/*`);
    console.log(`[Server] WebSocket:   ws://localhost:${PORT}/ws`);
    console.log(`[Server] Health:      http://localhost:${PORT}/health`);
    console.log(`[Server] On-chain:    ${contracts ? 'CONNECTED' : 'PAPER-TRADING MODE'}`);
    console.log('');
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Server] Shutting down...');
    polyFeed.stop();
    contracts?.removeAllListeners();
    wsServer.close();
    server.close(() => {
      console.log('[Server] Goodbye.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
