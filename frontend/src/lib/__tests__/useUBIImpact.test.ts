import { describe, it, expect } from 'vitest'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/useUBIImpact'

// ── Category metadata tests ───────────────────────────────────────────────────

describe('CATEGORY_COLORS', () => {
  it('has colors for all 7 protocol categories', () => {
    const expected = ['swap', 'perps', 'predict', 'lend', 'stable', 'stocks', 'bridge']
    for (const cat of expected) {
      expect(CATEGORY_COLORS[cat]).toBeDefined()
      expect(CATEGORY_COLORS[cat]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('returns unique colors for each category', () => {
    const colors = Object.values(CATEGORY_COLORS)
    const unique = new Set(colors)
    expect(unique.size).toBe(colors.length)
  })
})

describe('CATEGORY_ICONS', () => {
  it('has icons for all 7 protocol categories', () => {
    const expected = ['swap', 'perps', 'predict', 'lend', 'stable', 'stocks', 'bridge']
    for (const cat of expected) {
      expect(CATEGORY_ICONS[cat]).toBeDefined()
      expect(CATEGORY_ICONS[cat].length).toBeGreaterThan(0)
    }
  })
})

// ── Formatting helper tests ───────────────────────────────────────────────────
// We test the formatting logic by importing the page module's formatGD indirectly.
// Since it's not exported, we replicate the logic here for unit tests.

function formatGD(wei: bigint): string {
  const num = Number(wei) / 1e18
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(2)
}

describe('formatGD (UBI dashboard formatter)', () => {
  it('formats zero', () => {
    expect(formatGD(0n)).toBe('0.00')
  })

  it('formats small amounts', () => {
    // 500 G$ = 500e18 wei
    const val = BigInt('500000000000000000000')
    expect(formatGD(val)).toBe('500.00')
  })

  it('formats thousands with K suffix', () => {
    // 15,000 G$ = 15000e18
    const val = BigInt('15000000000000000000000')
    expect(formatGD(val)).toBe('15.00K')
  })

  it('formats millions with M suffix', () => {
    // 2,500,000 G$
    const val = BigInt('2500000000000000000000000')
    expect(formatGD(val)).toBe('2.50M')
  })

  it('formats exact boundary at 1000', () => {
    const val = BigInt('1000000000000000000000')
    expect(formatGD(val)).toBe('1.00K')
  })

  it('formats exact boundary at 1,000,000', () => {
    const val = BigInt('1000000000000000000000000')
    expect(formatGD(val)).toBe('1.00M')
  })

  it('formats fractional G$', () => {
    // 0.5 G$ = 5e17
    const val = BigInt('500000000000000000')
    expect(formatGD(val)).toBe('0.50')
  })
})

// ── Protocol stats calculation tests ──────────────────────────────────────────

describe('Protocol fee share calculation', () => {
  function calcFeeShare(protocolFees: bigint, totalFees: bigint): number {
    return totalFees > 0n ? Number((protocolFees * 10000n) / totalFees) / 100 : 0
  }

  it('calculates 100% for single protocol', () => {
    const share = calcFeeShare(1000n, 1000n)
    expect(share).toBe(100)
  })

  it('calculates 50% split', () => {
    const share = calcFeeShare(500n, 1000n)
    expect(share).toBe(50)
  })

  it('calculates 33% UBI share', () => {
    const share = calcFeeShare(330n, 1000n)
    expect(share).toBe(33)
  })

  it('returns 0 for zero total', () => {
    const share = calcFeeShare(100n, 0n)
    expect(share).toBe(0)
  })

  it('handles very small percentages', () => {
    const share = calcFeeShare(1n, 10000n)
    expect(share).toBe(0.01)
  })
})

// ── UBI percentage calculation ────────────────────────────────────────────────

describe('UBI percentage calculation', () => {
  function calcUBIPct(totalUBI: bigint, totalFees: bigint): number {
    return totalFees > 0n ? Number((totalUBI * 10000n) / totalFees) / 100 : 0
  }

  it('calculates ~33% for standard UBI split', () => {
    // 33 UBI from 100 fees
    const pct = calcUBIPct(33n, 100n)
    expect(pct).toBe(33)
  })

  it('returns 0 when no fees', () => {
    expect(calcUBIPct(0n, 0n)).toBe(0)
  })

  it('handles exact third', () => {
    // 333 out of 1000 = 33.3%
    const pct = calcUBIPct(333n, 1000n)
    expect(pct).toBe(33.3)
  })
})
