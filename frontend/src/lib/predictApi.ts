// ============================================================
// GoodPredict Backend API Client
// ============================================================
// Fetches live markets, order books, and price feeds from the
// GoodPredict backend (localhost:3040 in dev, env-configured in prod).

const PREDICT_API = process.env.NEXT_PUBLIC_PREDICT_API_URL ?? 'http://localhost:3040/api/v1'

export interface ApiMarket {
  id: string
  onChainId: number
  question: string
  category: string
  endTime: number     // Unix timestamp (seconds)
  status: 'OPEN' | 'CLOSED' | 'RESOLVED_YES' | 'RESOLVED_NO' | 'VOIDED'
  resolver: string
  totalYES: string    // BigInt serialised as string
  totalNO: string
  collateral: string
  tickSize: number
  createdAt: number
}

export interface ApiPriceFeed {
  marketId: string
  source: 'polymarket'
  yesMidpoint: number
  noMidpoint: number
  yesSpread: number
  noSpread: number
  updatedAt: number
}

export interface ApiOrderBookLevel {
  price: number
  size: number
  orders: number
}

export interface ApiOrderBook {
  marketId: string
  token: 'YES' | 'NO'
  bids: ApiOrderBookLevel[]
  asks: ApiOrderBookLevel[]
  midpoint: number
  spread: number
  timestamp: number
}

export interface ApiMarketDetail {
  market: ApiMarket
  orderbooks: { yes: ApiOrderBook | undefined; no: ApiOrderBook | undefined }
  polymarketFeed: ApiPriceFeed | null
}

// ────────────────────────────────────────────────────────────
// Fetch helpers
// ────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PREDICT_API}${path}`, {
      next: { revalidate: 10 },
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

export async function fetchMarkets(): Promise<ApiMarket[]> {
  const data = await apiFetch<{ markets: ApiMarket[] }>('/markets')
  return data?.markets ?? []
}

export async function fetchMarket(id: string): Promise<ApiMarketDetail | null> {
  return apiFetch<ApiMarketDetail>(`/markets/${id}`)
}

export async function fetchPriceFeed(marketId: string): Promise<ApiPriceFeed | null> {
  return apiFetch<ApiPriceFeed>(`/feeds/${marketId}`)
}

export async function fetchAllPriceFeeds(): Promise<ApiPriceFeed[]> {
  const data = await apiFetch<{ feeds: ApiPriceFeed[] }>('/feeds')
  return data?.feeds ?? []
}

// ────────────────────────────────────────────────────────────
// Create market (admin only)
// ────────────────────────────────────────────────────────────

export async function createMarket(params: {
  question: string
  category: string
  endTime: string | number
  resolver?: string
  polymarketYesTokenId?: string
  polymarketNoTokenId?: string
}): Promise<ApiMarket | null> {
  try {
    const res = await fetch(`${PREDICT_API}/markets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.market
  } catch {
    return null
  }
}
