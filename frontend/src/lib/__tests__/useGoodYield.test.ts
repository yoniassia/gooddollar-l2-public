import { describe, it, expect } from 'vitest'
import { parseTokenAmount, formatTokenAmount } from '@/lib/useGoodYield'

describe('useGoodYield — parseTokenAmount', () => {
  it('parses 18-decimal ETH amounts', () => {
    expect(parseTokenAmount('1.0', 18)).toBe(BigInt('1000000000000000000'))
  })

  it('parses 6-decimal USDC amounts', () => {
    expect(parseTokenAmount('100', 6)).toBe(BigInt('100000000'))
  })

  it('handles fractional values', () => {
    expect(parseTokenAmount('0.5', 18)).toBe(BigInt('500000000000000000'))
  })

  it('returns 0 for empty input', () => {
    expect(parseTokenAmount('', 18)).toBe(0n)
  })

  it('returns 0 for invalid input', () => {
    expect(parseTokenAmount('abc', 18)).toBe(0n)
  })

  it('handles zero', () => {
    expect(parseTokenAmount('0', 18)).toBe(0n)
  })

  it('parses large amounts', () => {
    expect(parseTokenAmount('1000000', 18)).toBe(BigInt('1000000000000000000000000'))
  })
})

describe('useGoodYield — formatTokenAmount', () => {
  it('formats 18-decimal to string', () => {
    const result = formatTokenAmount(BigInt('1000000000000000000'), 18)
    expect(result).toBe('1')
  })

  it('formats 6-decimal USDC', () => {
    const result = formatTokenAmount(BigInt('1500000'), 6)
    expect(parseFloat(result)).toBeCloseTo(1.5, 5)
  })

  it('formats zero', () => {
    expect(formatTokenAmount(0n, 18)).toBe('0')
  })

  it('formats fractional ETH', () => {
    const result = formatTokenAmount(BigInt('500000000000000000'), 18)
    expect(result).toBe('0.5')
  })

  it('formats very small amounts', () => {
    const result = formatTokenAmount(BigInt('1000000000000'), 18)
    expect(parseFloat(result)).toBeCloseTo(0.000001, 6)
  })
})
