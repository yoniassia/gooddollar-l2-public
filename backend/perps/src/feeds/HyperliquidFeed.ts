/**
 * Hyperliquid Price Feed Integration
 *
 * Connects to Hyperliquid's WebSocket API to stream real-time prices,
 * order book data, and trades. Used for:
 * 1. Oracle price feed (mark price calculation)
 * 2. External liquidity assessment (for smart order routing)
 * 3. Trade routing (execute on Hyperliquid when internal liquidity thin)
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import pino from 'pino';

const logger = pino({ name: 'hyperliquid-feed' });

export interface HyperliquidMids {
  [coin: string]: string; // coin → mid price
}

export interface HyperliquidL2Level {
  px: string;
  sz: string;
  n: number;
}

export interface HyperliquidBook {
  coin: string;
  levels: [HyperliquidL2Level[], HyperliquidL2Level[]]; // [bids, asks]
  time: number;
}

export interface HyperliquidTrade {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  tid: number;
}

export interface HyperliquidAssetCtx {
  coin: string;
  funding: number;
  openInterest: number;
  oraclePx: number;
  markPx: number;
  midPx?: number;
  dayNtlVlm: number;
  prevDayPx: number;
}

const MAINNET_WS = 'wss://api.hyperliquid.xyz/ws';
const MAINNET_REST = 'https://api.hyperliquid.xyz';
const TESTNET_WS = 'wss://api.hyperliquid-testnet.xyz/ws';
const TESTNET_REST = 'https://api.hyperliquid-testnet.xyz';

export class HyperliquidFeed extends EventEmitter {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private restUrl: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private isConnected = false;
  private subscribedCoins: Set<string> = new Set();
  private latestMids: HyperliquidMids = {};
  private latestBooks: Map<string, HyperliquidBook> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(options: { testnet?: boolean } = {}) {
    super();
    this.wsUrl = options.testnet ? TESTNET_WS : MAINNET_WS;
    this.restUrl = options.testnet ? TESTNET_REST : MAINNET_REST;
  }

  /**
   * Connect to Hyperliquid WebSocket and subscribe to feeds.
   */
  async connect(coins: string[]): Promise<void> {
    this.subscribedCoins = new Set(coins);
    return this.doConnect();
  }

  /**
   * Get latest mid price for a coin.
   */
  getMidPrice(coin: string): string | null {
    return this.latestMids[coin] ?? null;
  }

  /**
   * Get all latest mid prices.
   */
  getAllMids(): HyperliquidMids {
    return { ...this.latestMids };
  }

  /**
   * Get latest L2 book for a coin.
   */
  getBook(coin: string): HyperliquidBook | null {
    return this.latestBooks.get(coin) ?? null;
  }

  /**
   * Fetch all mid prices via REST (one-shot).
   */
  async fetchMids(): Promise<HyperliquidMids> {
    const response = await fetch(`${this.restUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    const data = await response.json() as HyperliquidMids;
    this.latestMids = data;
    return data;
  }

  /**
   * Fetch L2 book via REST (one-shot).
   */
  async fetchL2Book(coin: string): Promise<HyperliquidBook> {
    const response = await fetch(`${this.restUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'l2Book', coin }),
    });
    const data = await response.json() as HyperliquidBook;
    this.latestBooks.set(coin, data);
    return data;
  }

  /**
   * Fetch asset metadata and live context.
   */
  async fetchMetaAndCtx(): Promise<any> {
    const response = await fetch(`${this.restUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    return response.json();
  }

  /**
   * Fetch candle data.
   */
  async fetchCandles(coin: string, interval: string, startTime: number, endTime?: number): Promise<any[]> {
    const response = await fetch(`${this.restUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: { coin, interval, startTime, endTime: endTime ?? Date.now() },
      }),
    });
    return response.json() as Promise<any[]>;
  }

  /**
   * Disconnect.
   */
  disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  // --- Private ---

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        logger.info('Connected to Hyperliquid WebSocket');
        this.isConnected = true;
        this.reconnectDelay = 1000;

        // Subscribe to allMids
        this.send({ method: 'subscribe', subscription: { type: 'allMids' } });

        // Subscribe to per-coin feeds
        for (const coin of this.subscribedCoins) {
          this.send({ method: 'subscribe', subscription: { type: 'l2Book', coin } });
          this.send({ method: 'subscribe', subscription: { type: 'trades', coin } });
          this.send({ method: 'subscribe', subscription: { type: 'activeAssetCtx', coin } });
        }

        // Ping keepalive
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.ping();
          }
        }, 30000);

        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (err) {
          logger.error({ err }, 'Failed to parse WebSocket message');
        }
      });

      this.ws.on('close', () => {
        logger.warn('Hyperliquid WebSocket disconnected');
        this.isConnected = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        logger.error({ err }, 'Hyperliquid WebSocket error');
        if (!this.isConnected) reject(err);
      });
    });
  }

  private handleMessage(msg: any): void {
    const { channel, data } = msg;

    switch (channel) {
      case 'allMids':
        this.latestMids = data.mids;
        this.emit('mids', data.mids);
        break;

      case 'l2Book':
        const book: HyperliquidBook = data;
        this.latestBooks.set(book.coin, book);
        this.emit('book', book);
        break;

      case 'trades':
        const trades: HyperliquidTrade[] = Array.isArray(data) ? data : [data];
        for (const trade of trades) {
          this.emit('trade', trade);
        }
        break;

      case 'activeAssetCtx':
        this.emit('assetCtx', data);
        break;

      case 'subscriptionResponse':
        logger.debug({ subscription: data }, 'Subscription confirmed');
        break;

      default:
        logger.debug({ channel }, 'Unknown channel');
    }
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    logger.info({ delay: this.reconnectDelay }, 'Scheduling reconnect');
    setTimeout(() => {
      this.doConnect().catch(err => {
        logger.error({ err }, 'Reconnect failed');
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
  }
}
