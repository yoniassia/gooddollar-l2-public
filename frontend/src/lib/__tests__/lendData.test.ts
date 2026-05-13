import { describe, it, expect } from 'vitest'
import {
  getAvailableLiquidity,
  getUtilizationRate,
  formatAPY,
  formatUSD,
  formatHealthFactor,
  healthFactorColor,
  getReserves,
  getReserveBySymbol,
  type LendReserve,
} from '@/lib/lendData'

function makeReserve(totalSupplied: number, totalBorrowed: number): LendReserve {
  return {
    symbol: 'TEST',
    name: 'Test',
    address: '0x0000000000000000000000000000000000000001',
    decimals: 18,
    price: 1,
    totalSupplied,
    totalBorrowed,
    supplyAPY: 0.05,
    borrowAPY: 0.08,
    ltvBPS: 7500,
    liquidationThresholdBPS: 8000,
    liquidationBonusBPS: 10500,
    reserveFactorBPS: 1000,
    isActive: true,
    borrowingEnabled: true,
    gTokenSymbol: 'gTEST',
  }
}

describe('getAvailableLiquidity', () => {
  it('returns supplied minus borrowed', () => {
    const reserve = makeReserve(1000, 600)
    expect(getAvailableLiquidity(reserve)).toBe(400)
  })

  it('returns 0 when fully utilized', () => {
    const reserve = makeReserve(1000, 1000)
    expect(getAvailableLiquidity(reserve)).toBe(0)
  })
})

describe('getUtilizationRate', () => {
  it('computes borrowedAmount / supplied', () => {
    const reserve = makeReserve(1000, 600)
    expect(getUtilizationRate(reserve)).toBeCloseTo(0.6)
  })

  it('returns 0 when nothing supplied', () => {
    const reserve = makeReserve(0, 0)
    expect(getUtilizationRate(reserve)).toBe(0)
  })

  it('returns 1 when fully utilized', () => {
    const reserve = makeReserve(500, 500)
    expect(getUtilizationRate(reserve)).toBe(1)
  })
})

describe('formatAPY', () => {
  it('formats 5% APY', () => {
    expect(formatAPY(0.05)).toBe('5.00%')
  })

  it('formats 0% APY', () => {
    expect(formatAPY(0)).toBe('0.00%')
  })

  it('formats fractional APY', () => {
    expect(formatAPY(0.0624)).toBe('6.24%')
  })
})

describe('formatUSD', () => {
  it('formats small values with two decimals', () => {
    expect(formatUSD(123.45)).toBe('$123.45')
  })

  it('formats thousands as K', () => {
    expect(formatUSD(5000)).toBe('$5.00K')
  })

  it('formats millions as M', () => {
    expect(formatUSD(2_500_000)).toBe('$2.50M')
  })

  it('formats billions as B', () => {
    expect(formatUSD(1_200_000_000)).toBe('$1.20B')
  })
})

describe('formatHealthFactor', () => {
  it('returns infinity symbol for Infinity', () => {
    expect(formatHealthFactor(Infinity)).toBe('∞')
  })

  it('formats normal health factor', () => {
    expect(formatHealthFactor(1.75)).toBe('1.75')
  })

  it('formats critical health factor', () => {
    expect(formatHealthFactor(1.05)).toBe('1.05')
  })
})

describe('healthFactorColor', () => {
  it('returns green for Infinity', () => {
    expect(healthFactorColor(Infinity)).toBe('text-green-400')
  })

  it('returns green for hf >= 2', () => {
    expect(healthFactorColor(2.5)).toBe('text-green-400')
  })

  it('returns goodgreen for hf between 1.5 and 2', () => {
    expect(healthFactorColor(1.8)).toBe('text-goodgreen')
  })

  it('returns yellow for hf between 1.2 and 1.5', () => {
    expect(healthFactorColor(1.3)).toBe('text-yellow-400')
  })

  it('returns red for hf below 1.2', () => {
    expect(healthFactorColor(1.1)).toBe('text-red-400')
  })
})

describe('getReserves', () => {
  it('returns an array of reserves', () => {
    const reserves = getReserves()
    expect(reserves.length).toBeGreaterThan(0)
  })

  it('each reserve has required fields', () => {
    const reserves = getReserves()
    for (const r of reserves) {
      expect(r.symbol).toBeTruthy()
      expect(typeof r.supplyAPY).toBe('number')
      expect(typeof r.borrowAPY).toBe('number')
      expect(typeof r.totalSupplied).toBe('number')
    }
  })
})

describe('getReserveBySymbol', () => {
  it('returns a reserve when found', () => {
    const reserve = getReserveBySymbol('USDC')
    expect(reserve).toBeDefined()
    expect(reserve?.symbol).toBe('USDC')
  })

  it('returns undefined for unknown symbol', () => {
    expect(getReserveBySymbol('FAKE')).toBeUndefined()
  })
})
