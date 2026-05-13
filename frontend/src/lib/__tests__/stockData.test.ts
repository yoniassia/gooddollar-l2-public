import { describe, it, expect } from 'vitest'
import { formatStockPrice, formatLargeNumber, getStockData, getStockByTicker, getAllTickers } from '@/lib/stockData'

describe('formatStockPrice', () => {
  it('formats a price with 2 decimal places', () => {
    expect(formatStockPrice(178.72)).toBe('$178.72')
  })

  it('formats a round price', () => {
    expect(formatStockPrice(100)).toBe('$100.00')
  })

  it('formats a large price with commas', () => {
    const result = formatStockPrice(1234.56)
    expect(result).toBe('$1,234.56')
  })

  it('formats a negative price', () => {
    const result = formatStockPrice(-50.25)
    expect(result).toMatch(/-?\$?50\.25|\$-50\.25/)
  })
})

describe('formatLargeNumber', () => {
  it('formats trillions', () => {
    expect(formatLargeNumber(2.5e12)).toBe('$2.50T')
  })

  it('formats billions', () => {
    expect(formatLargeNumber(1_500_000_000)).toBe('$1.5B')
  })

  it('formats millions', () => {
    expect(formatLargeNumber(3_200_000)).toBe('$3.2M')
  })

  it('formats thousands', () => {
    expect(formatLargeNumber(5000)).toBe('$5K')
  })

  it('formats values under 1000', () => {
    expect(formatLargeNumber(250)).toBe('$250')
  })
})

describe('getStockData (deprecated — returns empty, use hooks)', () => {
  it('returns an empty array (data now comes from useOnChainStocks hook)', () => {
    const stocks = getStockData()
    expect(stocks).toEqual([])
  })
})

describe('getStockByTicker (deprecated — returns undefined, use hooks)', () => {
  it('returns undefined (data now comes from useOnChainStocks hook)', () => {
    expect(getStockByTicker('AAPL')).toBeUndefined()
  })

  it('returns undefined for unknown ticker', () => {
    expect(getStockByTicker('XXXX')).toBeUndefined()
  })
})

describe('getAllTickers', () => {
  it('returns an array of ticker strings', () => {
    const tickers = getAllTickers()
    expect(tickers.length).toBeGreaterThan(0)
    expect(tickers.every(t => typeof t === 'string')).toBe(true)
  })

  it('includes AAPL', () => {
    expect(getAllTickers()).toContain('AAPL')
  })
})
