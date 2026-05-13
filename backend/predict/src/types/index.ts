// ============================================================
// GoodPredict Type Definitions
// ============================================================

export type Side = 'BUY' | 'SELL';
export type OutcomeToken = 'YES' | 'NO';
export type OrderType = 'GTC' | 'GTD' | 'FOK' | 'FAK';
export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';
export type TradeStatus = 'MATCHED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
export type MarketStatus = 'OPEN' | 'CLOSED' | 'RESOLVED_YES' | 'RESOLVED_NO' | 'VOIDED';

export interface Market {
  id: string;
  onChainId: number;          // Index in MarketFactory.markets[]
  question: string;
  category: string;
  endTime: number;             // Unix timestamp
  status: MarketStatus;
  resolver: string;            // Address
  totalYES: bigint;
  totalNO: bigint;
  collateral: bigint;
  tickSize: number;            // e.g., 0.01
  polymarketTokenId?: string;  // Linked Polymarket token ID (if any)
  createdAt: number;
}

export interface Order {
  id: string;
  marketId: string;
  token: OutcomeToken;         // YES or NO
  side: Side;                  // BUY or SELL
  price: number;               // 0.01 - 0.99
  size: number;                // Number of tokens
  filledSize: number;
  status: OrderStatus;
  type: OrderType;
  maker: string;               // Address
  expiration?: number;         // Unix timestamp (for GTD)
  createdAt: number;
  updatedAt: number;
}

export interface Trade {
  id: string;
  marketId: string;
  token: OutcomeToken;
  makerOrderId: string;
  takerOrderId: string;
  price: number;
  size: number;
  maker: string;
  taker: string;
  status: TradeStatus;
  txHash?: string;
  createdAt: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  orders: number;              // Number of orders at this level
}

export interface OrderBookSnapshot {
  marketId: string;
  token: OutcomeToken;
  bids: OrderBookLevel[];      // Sorted highest-first
  asks: OrderBookLevel[];      // Sorted lowest-first
  midpoint: number;
  spread: number;
  timestamp: number;
}

export interface PriceFeed {
  marketId: string;
  source: 'polymarket' | 'goodpredict';
  yesMidpoint: number;
  noMidpoint: number;
  yesSpread: number;
  noSpread: number;
  updatedAt: number;
}

// WebSocket message types
export type WSMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'orderbook_snapshot'
  | 'orderbook_update'
  | 'trade'
  | 'order_update'
  | 'price_update'
  | 'market_update';

export interface WSMessage {
  type: WSMessageType;
  channel?: string;
  data: unknown;
}

export interface WSSubscription {
  type: 'subscribe' | 'unsubscribe';
  channels: string[];  // e.g., ['market:btc-100k', 'orderbook:btc-100k:YES']
}
