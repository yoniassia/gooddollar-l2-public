/**
 * GoodPerps WebSocket Server
 *
 * Client-facing WebSocket API for:
 * - Real-time order book updates
 * - Trade stream
 * - User order/position updates
 * - Oracle price feeds
 *
 * Protocol inspired by Hyperliquid's WebSocket API design.
 */

import WebSocket, { WebSocketServer as WSServer } from 'ws';
import http from 'http';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import { MatchingEngine, SettlementBatch } from '../orderbook/MatchingEngine';
import { OracleAggregator, OraclePrice } from '../feeds/OracleAggregator';
import { Order, Trade, L2Book, Side, OrderType, TimeInForce } from '../orderbook/types';

const logger = pino({ name: 'ws-server' });

interface ClientSession {
  id: string;
  ws: WebSocket;
  userId?: string;
  subscriptions: Set<string>;
  authenticated: boolean;
}

interface WsMessage {
  method: string;
  id?: string;  // Request ID for correlation
  [key: string]: any;
}

export class GoodPerpsWebSocketServer extends EventEmitter {
  private wss: WSServer;
  private clients: Map<string, ClientSession> = new Map();
  private userClients: Map<string, Set<string>> = new Map(); // userId → client IDs
  private engine: MatchingEngine;
  private oracle: OracleAggregator;
  private httpServer: http.Server;

  constructor(
    httpServer: http.Server,
    engine: MatchingEngine,
    oracle: OracleAggregator,
  ) {
    super();
    this.httpServer = httpServer;
    this.engine = engine;
    this.oracle = oracle;

    this.wss = new WSServer({ server: httpServer, path: '/ws' });

    this.setupEventForwarding();
    this.setupConnectionHandler();
  }

  /**
   * Broadcast to all clients subscribed to a channel.
   */
  private broadcast(channel: string, data: any, market?: string): void {
    const subKey = market ? `${channel}:${market}` : channel;

    for (const client of this.clients.values()) {
      if (client.subscriptions.has(subKey) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ channel, data }));
      }
    }
  }

  /**
   * Send to specific user's connected clients.
   */
  private sendToUser(userId: string, channel: string, data: any): void {
    const clientIds = this.userClients.get(userId);
    if (!clientIds) return;

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client?.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ channel, data }));
      }
    }
  }

  private setupEventForwarding(): void {
    // Forward order book updates
    this.engine.on('bookUpdate', (book: L2Book) => {
      this.broadcast('l2Book', book, book.market);
    });

    // Forward trades
    this.engine.on('trade', (trade: Trade) => {
      this.broadcast('trades', trade, trade.market);

      // Send to maker and taker
      this.sendToUser(trade.makerUserId, 'userFills', trade);
      this.sendToUser(trade.takerUserId, 'userFills', trade);
    });

    // Forward order updates
    this.engine.on('order', (order: Order) => {
      this.sendToUser(order.userId, 'orderUpdates', {
        order: {
          id: order.id,
          clientId: order.clientId,
          market: order.market,
          side: order.side,
          type: order.type,
          price: order.price,
          size: order.size,
          filledSize: order.filledSize,
          remainingSize: order.remainingSize,
          status: order.status,
          timestamp: order.timestamp,
        },
        status: order.status,
        statusTimestamp: order.updatedAt,
      });
    });

    // Forward settlement batches
    this.engine.on('settlement', (batch: SettlementBatch) => {
      this.broadcast('settlement', {
        batchId: batch.id,
        tradeCount: batch.trades.length,
        totalVolume: batch.totalVolume,
        totalFees: batch.totalFees,
        timestamp: batch.timestamp,
      });
    });

    // Forward oracle prices
    this.oracle.on('price', (price: OraclePrice) => {
      this.broadcast('oracle', price, price.market);
    });
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const clientId = uuidv4();
      const session: ClientSession = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        authenticated: false,
      };
      this.clients.set(clientId, session);

      logger.info({ clientId, ip: req.socket.remoteAddress }, 'Client connected');

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg: WsMessage = JSON.parse(data.toString());
          this.handleClientMessage(session, msg);
        } catch (err) {
          ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        if (session.userId) {
          const userSessions = this.userClients.get(session.userId);
          if (userSessions) {
            userSessions.delete(clientId);
            if (userSessions.size === 0) this.userClients.delete(session.userId);
          }
        }
        logger.info({ clientId }, 'Client disconnected');
      });

      ws.on('error', (err) => {
        logger.error({ clientId, err }, 'Client WebSocket error');
      });

      // Send welcome
      ws.send(JSON.stringify({
        channel: 'connected',
        data: { clientId, markets: this.engine.getMarkets() },
      }));
    });
  }

  private handleClientMessage(session: ClientSession, msg: WsMessage): void {
    switch (msg.method) {
      case 'subscribe':
        this.handleSubscribe(session, msg);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(session, msg);
        break;

      case 'auth':
        this.handleAuth(session, msg);
        break;

      case 'order':
        this.handleOrder(session, msg);
        break;

      case 'cancel':
        this.handleCancel(session, msg);
        break;

      case 'cancelAll':
        this.handleCancelAll(session, msg);
        break;

      case 'getBook':
        this.handleGetBook(session, msg);
        break;

      case 'getOrders':
        this.handleGetOrders(session, msg);
        break;

      default:
        session.ws.send(JSON.stringify({
          error: `Unknown method: ${msg.method}`,
          id: msg.id,
        }));
    }
  }

  private handleSubscribe(session: ClientSession, msg: WsMessage): void {
    const { subscription } = msg;
    if (!subscription?.type) {
      session.ws.send(JSON.stringify({ error: 'Missing subscription type', id: msg.id }));
      return;
    }

    const { type, coin, market, user } = subscription;
    const subKey = market || coin ? `${type}:${market || coin}` : type;
    session.subscriptions.add(subKey);

    // For user-specific subscriptions
    if (user && session.authenticated && session.userId === user) {
      const userSubKey = `${type}:${user}`;
      session.subscriptions.add(userSubKey);
    }

    // Send snapshot
    let snapshot: any = null;
    switch (type) {
      case 'l2Book':
        snapshot = this.engine.getBook(market || coin, 20);
        break;
      case 'trades':
        snapshot = this.engine.getRecentTrades(market || coin, 50);
        break;
      case 'oracle':
        snapshot = this.oracle.getPrice(market || coin);
        break;
    }

    session.ws.send(JSON.stringify({
      channel: 'subscriptionResponse',
      data: { method: 'subscribe', subscription },
    }));

    if (snapshot) {
      session.ws.send(JSON.stringify({
        channel: type,
        data: snapshot,
        isSnapshot: true,
      }));
    }
  }

  private handleUnsubscribe(session: ClientSession, msg: WsMessage): void {
    const { subscription } = msg;
    if (!subscription?.type) return;

    const { type, market, coin } = subscription;
    const subKey = market || coin ? `${type}:${market || coin}` : type;
    session.subscriptions.delete(subKey);

    session.ws.send(JSON.stringify({
      channel: 'subscriptionResponse',
      data: { method: 'unsubscribe', subscription },
    }));
  }

  private handleAuth(session: ClientSession, msg: WsMessage): void {
    // TODO: Verify EIP-712 signature or JWT
    const { userId, signature } = msg;
    if (!userId) {
      session.ws.send(JSON.stringify({ error: 'Missing userId', id: msg.id }));
      return;
    }

    // For now, accept any userId (add signature verification later)
    session.userId = userId;
    session.authenticated = true;

    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.userClients.get(userId)!.add(session.id);

    session.ws.send(JSON.stringify({
      channel: 'auth',
      data: { success: true, userId },
      id: msg.id,
    }));
  }

  private handleOrder(session: ClientSession, msg: WsMessage): void {
    if (!session.authenticated || !session.userId) {
      session.ws.send(JSON.stringify({ error: 'Not authenticated', id: msg.id }));
      return;
    }

    try {
      const result = this.engine.submitOrder({
        userId: session.userId,
        market: msg.market,
        side: msg.side as Side,
        type: msg.type || OrderType.Limit,
        price: msg.price,
        size: msg.size,
        timeInForce: msg.timeInForce as TimeInForce,
        reduceOnly: msg.reduceOnly,
        clientId: msg.clientId,
      });

      session.ws.send(JSON.stringify({
        channel: 'orderResponse',
        data: {
          order: result.order,
          trades: result.internalTrades.length,
          externalRouted: result.externalRouted,
        },
        id: msg.id,
      }));
    } catch (err: any) {
      session.ws.send(JSON.stringify({
        error: err.message,
        id: msg.id,
      }));
    }
  }

  private handleCancel(session: ClientSession, msg: WsMessage): void {
    if (!session.authenticated || !session.userId) {
      session.ws.send(JSON.stringify({ error: 'Not authenticated', id: msg.id }));
      return;
    }

    const order = this.engine.cancelOrder(msg.market, msg.orderId, session.userId);
    session.ws.send(JSON.stringify({
      channel: 'cancelResponse',
      data: { success: !!order, order },
      id: msg.id,
    }));
  }

  private handleCancelAll(session: ClientSession, msg: WsMessage): void {
    if (!session.authenticated || !session.userId) {
      session.ws.send(JSON.stringify({ error: 'Not authenticated', id: msg.id }));
      return;
    }

    // Cancel across all markets
    const markets = msg.market ? [msg.market] : this.engine.getMarkets();
    let totalCanceled = 0;
    for (const market of markets) {
      const book = (this.engine as any).books?.get(market);
      if (book) {
        const canceled = book.cancelAllOrders(session.userId);
        totalCanceled += canceled.length;
      }
    }

    session.ws.send(JSON.stringify({
      channel: 'cancelAllResponse',
      data: { success: true, count: totalCanceled },
      id: msg.id,
    }));
  }

  private handleGetBook(session: ClientSession, msg: WsMessage): void {
    const book = this.engine.getBook(msg.market, msg.depth || 20);
    session.ws.send(JSON.stringify({
      channel: 'l2Book',
      data: book,
      id: msg.id,
    }));
  }

  private handleGetOrders(session: ClientSession, msg: WsMessage): void {
    if (!session.authenticated || !session.userId) {
      session.ws.send(JSON.stringify({ error: 'Not authenticated', id: msg.id }));
      return;
    }

    const orders = this.engine.getUserOrders(session.userId, msg.market);
    session.ws.send(JSON.stringify({
      channel: 'openOrders',
      data: orders,
      id: msg.id,
    }));
  }

  /**
   * Get connected client count.
   */
  get clientCount(): number {
    return this.clients.size;
  }
}
