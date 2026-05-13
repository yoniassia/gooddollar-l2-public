import { describe, it, expect } from 'vitest'
import { getStockPrice } from '@/lib/useStockPrices'
import { getStockByTicker } from '@/lib/stockData'

describe('getStockPrice', () => {
  it('returns price from live prices map when available', () => {
    const prices = { AAPL: 195.00, TSLA: 300.00 }
    expect(getStockPrice(prices, 'AAPL')).toBe(195.00)
    expect(getStockPrice(prices, 'TSLA')).toBe(300.00)
  })

  it('falls back to static seed price when not in live prices', () => {
    const applStock = getStockByTicker('AAPL')
    expect(getStockPrice({}, 'AAPL')).toBe(applStock?.price ?? 0)
  })

  it('returns 0 for completely unknown ticker', () => {
    expect(getStockPrice({}, 'XYZFAKE')).toBe(0)
  })

  it('live price overrides fallback', () => {
    const livePrices = { NVDA: 999.99 }
    expect(getStockPrice(livePrices, 'NVDA')).toBe(999.99)
  })
})
