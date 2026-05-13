// ============================================================
// GoodPredict WebSocket Server
// ============================================================
// Real-time updates for orderbook changes, trades, and prices.
// Clients subscribe to channels like 'orderbook:marketId:YES'

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WSMessage, WSSubscription, Trade, Order, OrderBookSnapshot, PriceFeed } from '../types/index.js';

interface Client {
  ws: WebSocket;
  subscriptions: Set<string>;
  isAlive: boolean;
}

export class PredictWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<Client> = new Set();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      const client: Client = { ws, subscriptions: new Set(), isAlive: true };
      this.clients.add(client);

      console.log(`[WS] Client connected (total: ${this.clients.size})`);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as WSSubscription;
          this.handleSubscription(client, msg);
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message format' } }));
        }
      });

      ws.on('pong', () => { client.isAlive = true; });

      ws.on('close', () => {
        this.clients.delete(client);
        console.log(`[WS] Client disconnected (total: ${this.clients.size})`);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
        this.clients.delete(client);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        data: { message: 'Connected to GoodPredict WebSocket', timestamp: Date.now() }
      }));
    });

    // Heartbeat to detect dead connections
    this.pingInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }, 30000);
  }

  /** Broadcast an orderbook snapshot to subscribers */
  broadcastOrderBook(snapshot: OrderBookSnapshot): void {
    const channel = `orderbook:${snapshot.marketId}:${snapshot.token}`;
    this.broadcast(channel, {
      type: 'orderbook_snapshot',
      channel,
      data: snapshot,
    });
  }

  /** Broadcast a trade to subscribers */
  broadcastTrade(trade: Trade): void {
    const channel = `market:${trade.marketId}`;
    this.broadcast(channel, {
      type: 'trade',
      channel,
      data: trade,
    });
  }

  /** Broadcast an order update to the specific user */
  broadcastOrderUpdate(order: Order): void {
    const channel = `user:${order.maker}`;
    this.broadcast(channel, {
      type: 'order_update',
      channel,
      data: order,
    });
  }

  /** Broadcast a price update */
  broadcastPriceUpdate(feed: PriceFeed): void {
    const channel = `price:${feed.marketId}`;
    this.broadcast(channel, {
      type: 'price_update',
      channel,
      data: feed,
    });
  }

  /** Broadcast a market status update */
  broadcastMarketUpdate(marketId: string, data: Record<string, unknown>): void {
    const channel = `market:${marketId}`;
    this.broadcast(channel, {
      type: 'market_update',
      channel,
      data,
    });
  }

  /** Get connection stats */
  getStats(): { connections: number; subscriptions: Map<string, number> } {
    const subscriptions = new Map<string, number>();
    for (const client of this.clients) {
      for (const sub of client.subscriptions) {
        subscriptions.set(sub, (subscriptions.get(sub) || 0) + 1);
      }
    }
    return { connections: this.clients.size, subscriptions };
  }

  close(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    for (const client of this.clients) {
      client.ws.terminate();
    }
    this.wss.close();
  }

  // ============================================================
  // Private
  // ============================================================

  private handleSubscription(client: Client, msg: WSSubscription): void {
    if (msg.type === 'subscribe') {
      for (const channel of msg.channels) {
        client.subscriptions.add(channel);
      }
      client.ws.send(JSON.stringify({
        type: 'subscribed',
        data: { channels: msg.channels }
      }));
    } else if (msg.type === 'unsubscribe') {
      for (const channel of msg.channels) {
        client.subscriptions.delete(channel);
      }
      client.ws.send(JSON.stringify({
        type: 'unsubscribed',
        data: { channels: msg.channels }
      }));
    }
  }

  private broadcast(channel: string, message: WSMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}
