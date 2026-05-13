import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getMarketStatus, getDaysLeftLabel, filterAndSortMarkets, type PredictionMarket } from '../predictData'

describe('getMarketStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "expired" for past dates', () => {
    expect(getMarketStatus('2025-12-31')).toBe('expired')
    expect(getMarketStatus('2026-04-01')).toBe('expired')
  })

  it('returns "ending-today" for dates within 24 hours', () => {
    expect(getMarketStatus('2026-04-03')).toBe('ending-today')
  })

  it('returns "active" for future dates', () => {
    expect(getMarketStatus('2026-04-10')).toBe('active')
    expect(getMarketStatus('2027-01-01')).toBe('active')
  })
})

describe('getDaysLeftLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Expired" for past dates', () => {
    expect(getDaysLeftLabel('2025-12-31')).toBe('Expired')
  })

  it('returns "Ending today" for dates within 24h', () => {
    expect(getDaysLeftLabel('2026-04-03')).toBe('Ending today')
  })

  it('returns "Xd left" for future dates', () => {
    expect(getDaysLeftLabel('2026-04-10')).toMatch(/^\d+d left$/)
  })
})

describe('filterAndSortMarkets - ending sort with expired', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('places expired markets after active ones when sorting by ending', () => {
    const markets: PredictionMarket[] = [
      { id: '0', question: 'Expired market', category: 'Crypto', yesPrice: 0.5, volume: 1000, liquidity: 500, endDate: '2025-12-31', resolved: false, resolutionSource: 'test', createdAt: '2025-01-01', totalShares: 100 },
      { id: '1', question: 'Active market 1', category: 'Crypto', yesPrice: 0.7, volume: 2000, liquidity: 1000, endDate: '2026-12-31', resolved: false, resolutionSource: 'test', createdAt: '2026-01-01', totalShares: 200 },
      { id: '2', question: 'Active market 2', category: 'AI & Tech', yesPrice: 0.3, volume: 500, liquidity: 200, endDate: '2027-06-01', resolved: false, resolutionSource: 'test', createdAt: '2026-02-01', totalShares: 50 },
    ]
    const sorted = filterAndSortMarkets(markets, 'All', 'ending', '')
    const statuses = sorted.map(m => getMarketStatus(m.endDate))
    const firstExpiredIdx = statuses.indexOf('expired')
    const lastActiveIdx = statuses.lastIndexOf('active')
    if (firstExpiredIdx !== -1 && lastActiveIdx !== -1) {
      expect(firstExpiredIdx).toBeGreaterThan(lastActiveIdx)
    }
  })
})
