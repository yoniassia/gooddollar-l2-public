import { describe, it, expect } from 'vitest'
import { formatPerpsPrice, formatLargeValue } from '../perpsData'
import { formatLargeNumber } from '../stockData'

describe('formatPerpsPrice — large value abbreviation', () => {
  it('abbreviates quadrillions', () => {
    expect(formatPerpsPrice(6e15)).toBe('$6.00Q')
    expect(formatPerpsPrice(1.5e16)).toBe('$15.0Q')
  })

  it('abbreviates trillions', () => {
    expect(formatPerpsPrice(6.01e12)).toBe('$6.01T')
    expect(formatPerpsPrice(1.5e12)).toBe('$1.50T')
  })

  it('abbreviates billions', () => {
    expect(formatPerpsPrice(601e9)).toBe('$601B')
    expect(formatPerpsPrice(2.45e9)).toBe('$2.45B')
  })

  it('abbreviates millions', () => {
    expect(formatPerpsPrice(890e6)).toBe('$890M')
    expect(formatPerpsPrice(1.5e6)).toBe('$1.50M')
  })

  it('uses commas for thousands', () => {
    expect(formatPerpsPrice(60125.80)).toBe('$60,125.80')
    expect(formatPerpsPrice(1234.56)).toBe('$1,234.56')
  })

  it('handles small values', () => {
    expect(formatPerpsPrice(0.5)).toBe('$0.5000')
    expect(formatPerpsPrice(0.005)).toBe('$0.005000')
  })

  it('handles negative large values', () => {
    expect(formatPerpsPrice(-1.5e12)).toBe('-$1.50T')
    expect(formatPerpsPrice(-2e9)).toBe('-$2.00B')
  })

  it('uses adaptive decimals based on magnitude', () => {
    expect(formatPerpsPrice(150e12)).toBe('$150T')
    expect(formatPerpsPrice(15e12)).toBe('$15.0T')
    expect(formatPerpsPrice(1.5e12)).toBe('$1.50T')
  })
})

describe('formatLargeValue — order form values', () => {
  it('abbreviates quadrillions', () => {
    expect(formatLargeValue(3e15)).toBe('$3.00Q')
  })

  it('abbreviates trillions', () => {
    expect(formatLargeValue(3e12)).toBe('$3.00T')
  })

  it('abbreviates billions', () => {
    expect(formatLargeValue(6.01e9)).toBe('$6.01B')
  })

  it('abbreviates millions', () => {
    expect(formatLargeValue(300e6)).toBe('$300M')
  })

  it('abbreviates thousands', () => {
    expect(formatLargeValue(7285)).toBe('$7K')
  })

  it('formats small values with 2 decimals', () => {
    expect(formatLargeValue(42.5)).toBe('$42.50')
    expect(formatLargeValue(0.99)).toBe('$0.99')
  })

  it('handles negative values', () => {
    expect(formatLargeValue(-5e9)).toBe('-$5.00B')
  })
})

describe('formatLargeNumber — stock values', () => {
  it('abbreviates trillions', () => {
    expect(formatLargeNumber(3.09e12)).toBe('$3.09T')
  })

  it('abbreviates billions', () => {
    expect(formatLargeNumber(790e9)).toBe('$790.0B')
  })

  it('abbreviates millions', () => {
    expect(formatLargeNumber(22.1e6)).toBe('$22.1M')
  })

  it('abbreviates thousands', () => {
    expect(formatLargeNumber(500)).toBe('$500')
  })
})
