import { describe, it, expect } from 'vitest'
import { getPrice, FALLBACK_PRICES } from '@/lib/usePriceFeeds'

describe('getPrice', () => {
  it('returns live price from prices map when available', () => {
    const prices = { ETH: 3500 }
    expect(getPrice(prices, 'ETH')).toBe(3500)
  })

  it('falls back to FALLBACK_PRICES when not in live prices', () => {
    const prices: Record<string, number> = {}
    expect(getPrice(prices, 'ETH')).toBe(FALLBACK_PRICES.ETH)
  })

  it('returns 0 for unknown symbol not in fallback', () => {
    expect(getPrice({}, 'UNKNOWN')).toBe(0)
  })

  it('live price overrides fallback', () => {
    const prices = { USDC: 0.9999 }
    expect(getPrice(prices, 'USDC')).toBe(0.9999)
  })
})

describe('FALLBACK_PRICES', () => {
  it('has ETH price', () => {
    expect(FALLBACK_PRICES.ETH).toBeGreaterThan(0)
  })

  it('has stable USD coins at ~$1', () => {
    expect(FALLBACK_PRICES.USDC).toBe(1.00)
    expect(FALLBACK_PRICES.USDT).toBe(1.00)
    expect(FALLBACK_PRICES.DAI).toBe(1.00)
  })

  it('has G$ price', () => {
    expect(FALLBACK_PRICES['G$']).toBeGreaterThan(0)
  })
})
