/**
 * ExternalVenue — Common interface for external perps venue routers.
 *
 * Each venue (Hyperliquid, GMX, dYdX) implements this interface so the
 * SmartOrderRouter can query and route to them uniformly.
 */

import { Side } from '../orderbook/types';

export interface VenueQuote {
  venue: string;
  market: string;
  side: Side;
  availableSize: string;
  avgPrice: string;
  fee: string;
  latencyMs: number;
}

export interface VenueFill {
  id: string;
  venue: string;
  market: string;
  side: Side;
  price: string;
  size: string;
  fee: string;
  userId: string;
  orderId: string;
  venueOrderId?: string;
  timestamp: number;
  simulated: boolean;
}

export interface ExternalVenue {
  /** Venue name (e.g., 'hyperliquid', 'gmx-v2', 'dydx-v4') */
  readonly name: string;

  /** Whether this venue is connected and operational */
  isReady(): boolean;

  /** Supported markets on this venue (e.g., ['BTC-USD', 'ETH-USD']) */
  getSupportedMarkets(): string[];

  /** Check if a specific market is supported */
  supportsMarket(market: string): boolean;

  /** Get a quote for routing (size, price, fees) without execution */
  getQuote(market: string, side: Side, size: string): Promise<VenueQuote | null>;

  /** Execute a fill on the venue */
  route(market: string, side: Side, size: string, userId: string, orderId: string): Promise<VenueFill | null>;

  /** Get venue stats */
  getStats(): VenueStats;
}

export interface VenueStats {
  venue: string;
  totalOrders: number;
  totalVolume: string;
  totalFees: string;
  isConnected: boolean;
  lastTradeTimestamp: number | null;
  mode: 'simulation' | 'production';
}
