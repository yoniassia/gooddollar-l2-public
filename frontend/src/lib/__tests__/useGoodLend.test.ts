import { describe, it, expect } from 'vitest'
import { parseTokenAmount, formatTokenAmount } from '@/lib/useGoodLend'

describe('parseTokenAmount', () => {
  it('parses 18-decimal token amounts', () => {
    const result = parseTokenAmount('1.0', 18)
    expect(result).toBe(BigInt('1000000000000000000'))
  })

  it('parses 6-decimal USDC amounts', () => {
    const result = parseTokenAmount('100', 6)
    expect(result).toBe(BigInt('100000000'))
  })

  it('handles fractional USDC', () => {
    const result = parseTokenAmount('1.5', 6)
    expect(result).toBe(BigInt('1500000'))
  })

  it('returns 0 for empty string', () => {
    expect(parseTokenAmount('', 18)).toBe(BigInt(0))
  })

  it('returns 0 for non-numeric input', () => {
    expect(parseTokenAmount('abc', 18)).toBe(BigInt(0))
  })

  it('handles zero', () => {
    expect(parseTokenAmount('0', 18)).toBe(BigInt(0))
  })

  it('handles very small decimals', () => {
    const result = parseTokenAmount('0.000001', 6)
    expect(result).toBe(BigInt('1'))
  })
})

describe('formatTokenAmount', () => {
  it('converts 18-decimal bigint to float', () => {
    const result = formatTokenAmount(BigInt('1000000000000000000'), 18)
    expect(result).toBeCloseTo(1.0)
  })

  it('converts 6-decimal bigint to float', () => {
    const result = formatTokenAmount(BigInt('100000000'), 6)
    expect(result).toBeCloseTo(100.0)
  })

  it('returns 0 for BigInt(0)', () => {
    expect(formatTokenAmount(BigInt(0), 18)).toBe(0)
  })

  it('handles fractional values', () => {
    const result = formatTokenAmount(BigInt('1500000'), 6)
    expect(result).toBeCloseTo(1.5)
  })

  it('roundtrips with parseTokenAmount', () => {
    const parsed = parseTokenAmount('42.5', 18)
    const formatted = formatTokenAmount(parsed, 18)
    expect(formatted).toBeCloseTo(42.5)
  })
})
