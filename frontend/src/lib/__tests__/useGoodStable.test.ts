import { describe, it, expect } from 'vitest'
import { maxMintable, ILK_ETH, ILK_GD, ILK_USDC, ILKS } from '@/lib/useGoodStable'

describe('maxMintable', () => {
  it('returns max mintable gUSD with default safety buffer', () => {
    // 1 ETH at $2000, 150% liquidation ratio, 0 existing debt
    // maxDebt = (1 * 2000) / 1.5 = 1333.33
    // result = 1333.33 * 0.9 = 1200
    const result = maxMintable(1, 2000, 1.5, 0)
    expect(result).toBeCloseTo(1200, 0)
  })

  it('subtracts existing debt from result', () => {
    // 1 ETH at $2000, 150% ratio → maxDebt = 1333.33, safe = 1200
    // existing debt = 500, result = 1200 - 500 = 700
    const result = maxMintable(1, 2000, 1.5, 500)
    expect(result).toBeCloseTo(700, 0)
  })

  it('returns 0 when debt already at or above safe maximum', () => {
    // Already at max safe debt
    const result = maxMintable(1, 2000, 1.5, 1200)
    expect(result).toBeCloseTo(0, 0)
  })

  it('never returns negative values', () => {
    // Overcollateralised position (more debt than safe max)
    const result = maxMintable(1, 2000, 1.5, 2000)
    expect(result).toBe(0)
  })

  it('applies custom safety buffer', () => {
    // 1 ETH at $3000, 150% ratio → maxDebt = 2000
    // buffer = 0.8 → 1600 mintable
    const result = maxMintable(1, 3000, 1.5, 0, 0.8)
    expect(result).toBeCloseTo(1600, 0)
  })

  it('works with USDC 101% ratio (near 1:1)', () => {
    // 1000 USDC at $1, 101% ratio → maxDebt ≈ 990, safe = 891
    const result = maxMintable(1000, 1, 1.01, 0)
    expect(result).toBeCloseTo(891, 0)
  })
})

describe('ILK constants', () => {
  it('ILK_ETH is bytes32 hex string', () => {
    expect(ILK_ETH).toMatch(/^0x[0-9a-f]{64}$/)
    // ETH encoded as ASCII: 0x455448...
    expect(ILK_ETH.startsWith('0x455448')).toBe(true)
  })

  it('ILK_GD is bytes32 hex string', () => {
    expect(ILK_GD).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('ILK_USDC is bytes32 hex string', () => {
    expect(ILK_USDC).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

describe('ILKS array', () => {
  it('has 3 ilks', () => {
    expect(ILKS).toHaveLength(3)
  })

  it('includes ETH, GD, and USDC labels', () => {
    const labels = ILKS.map(i => i.label)
    expect(labels).toContain('WETH')
    expect(labels).toContain('G$')
    expect(labels).toContain('USDC')
  })

  it('each ilk has required fields', () => {
    for (const ilk of ILKS) {
      // key holds the bytes32 ilk value
      expect(ilk.key).toMatch(/^0x[0-9a-f]{64}$/)
      expect(ilk.label).toBeTruthy()
      expect(typeof ilk.decimals).toBe('number')
      expect(typeof ilk.minRatio).toBe('number')
    }
  })
})
