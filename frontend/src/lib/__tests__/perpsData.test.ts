import { describe, it, expect } from 'vitest'
import { formatPerpsPrice, formatLargeValue, formatFundingRate, getPairs, getPairBySymbol } from '@/lib/perpsData'

describe('formatPerpsPrice', () => {
  it('formats a BTC-style price', () => {
    expect(formatPerpsPrice(60125.80)).toBe('$60,125.80')
  })

  it('formats a G$-style micro price', () => {
    expect(formatPerpsPrice(0.0102)).toBe('$0.0102')
  })

  it('formats a small price with 2 decimal places', () => {
    expect(formatPerpsPrice(14.85)).toBe('$14.85')
  })

  it('formats negative prices with minus sign', () => {
    expect(formatPerpsPrice(-46.29)).toBe('-$46.29')
  })

  it('formats millions', () => {
    const result = formatPerpsPrice(2_000_000)
    expect(result).toContain('M')
  })

  it('formats billions', () => {
    const result = formatPerpsPrice(1_000_000_000)
    expect(result).toContain('B')
  })
})

describe('formatLargeValue', () => {
  it('formats thousands as K', () => {
    expect(formatLargeValue(7285)).toBe('$7K')
  })

  it('formats small values with 2 decimals', () => {
    expect(formatLargeValue(296)).toBe('$296.00')
  })

  it('formats negative values', () => {
    const result = formatLargeValue(-1000)
    expect(result).toContain('-')
  })
})

describe('formatFundingRate', () => {
  it('formats positive funding rate with + prefix', () => {
    expect(formatFundingRate(0.0085)).toBe('+0.8500%')
  })

  it('formats negative funding rate without + prefix', () => {
    expect(formatFundingRate(-0.0034)).toBe('-0.3400%')
  })

  it('formats zero funding rate with + prefix', () => {
    expect(formatFundingRate(0)).toBe('+0.0000%')
  })
})

describe('getPairs', () => {
  it('returns empty array (deprecated — use useOnChainPairs() hook instead)', () => {
    expect(getPairs()).toEqual([])
  })
})

describe('getPairBySymbol', () => {
  it('returns undefined (deprecated — use useOnChainPairs() hook instead)', () => {
    expect(getPairBySymbol('BTC-USD')).toBeUndefined()
  })
})
