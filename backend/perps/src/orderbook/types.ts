/**
 * GoodPerps Order Book Types
 */

export enum Side {
  Buy = 'buy',
  Sell = 'sell',
}

export enum OrderType {
  Limit = 'limit',
  Market = 'market',
  StopLoss = 'stop_loss',
  TakeProfit = 'take_profit',
}

export enum TimeInForce {
  GTC = 'gtc',       // Good til canceled
  IOC = 'ioc',       // Immediate or cancel
  FOK = 'fok',       // Fill or kill
  PostOnly = 'post_only', // Add liquidity only
}

export enum OrderStatus {
  New = 'new',
  PartiallyFilled = 'partially_filled',
  Filled = 'filled',
  Canceled = 'canceled',
  Rejected = 'rejected',
  Expired = 'expired',
}

export enum MarginMode {
  Cross = 'cross',
  Isolated = 'isolated',
}

export interface Order {
  id: string;
  clientId?: string;
  market: string;          // e.g., "BTC-USD"
  side: Side;
  type: OrderType;
  price: string;           // String for precision (BigNumber)
  size: string;            // String for precision
  filledSize: string;
  remainingSize: string;
  status: OrderStatus;
  timeInForce: TimeInForce;
  reduceOnly: boolean;
  postOnly: boolean;
  triggerPrice?: string;   // For stop/take-profit
  userId: string;
  timestamp: number;
  updatedAt: number;
}

export interface Trade {
  id: string;
  market: string;
  price: string;
  size: string;
  side: Side;              // Taker side
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  makerFee: string;
  takerFee: string;
  timestamp: number;
}

export interface L2Level {
  price: string;
  size: string;
  orderCount: number;
}

export interface L2Book {
  market: string;
  bids: L2Level[];
  asks: L2Level[];
  timestamp: number;
}

export interface Position {
  userId: string;
  market: string;
  side: Side;
  size: string;
  entryPrice: string;
  markPrice: string;
  liquidationPrice: string;
  margin: string;
  unrealizedPnl: string;
  realizedPnl: string;
  leverage: number;
  marginMode: MarginMode;
  timestamp: number;
}

export interface MarketConfig {
  symbol: string;           // e.g., "BTC-USD"
  baseAsset: string;        // e.g., "BTC"
  quoteAsset: string;       // e.g., "USD"
  tickSize: string;         // Minimum price increment
  lotSize: string;          // Minimum size increment
  minOrderSize: string;
  maxOrderSize: string;
  maxLeverage: number;
  maintenanceMarginRate: string;  // e.g., "0.005" = 0.5%
  initialMarginRate: string;      // e.g., "0.01" = 1% at 100x
  makerFeeRate: string;           // e.g., "-0.0002" (rebate)
  takerFeeRate: string;           // e.g., "0.0005" (0.05%)
  fundingInterval: number;        // ms, e.g., 3600000 (1 hour)
}

export interface PriceUpdate {
  market: string;
  price: string;
  source: 'hyperliquid' | 'pyth' | 'chainlink' | 'internal';
  timestamp: number;
}

export interface FundingRate {
  market: string;
  rate: string;             // e.g., "0.0001" = 0.01%
  markPrice: string;
  indexPrice: string;
  nextFundingTime: number;
  timestamp: number;
}
