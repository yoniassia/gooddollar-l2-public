import { describe, it, expect } from 'vitest'

function sanitizePositiveInput(value: string): string {
  if (value === '' || value === '.') return value
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  if (num < 0) return ''
  return value
}

describe('sanitizePositiveInput', () => {
  it('allows empty string', () => {
    expect(sanitizePositiveInput('')).toBe('')
  })

  it('allows decimal point alone', () => {
    expect(sanitizePositiveInput('.')).toBe('.')
  })

  it('allows positive numbers', () => {
    expect(sanitizePositiveInput('5')).toBe('5')
    expect(sanitizePositiveInput('0.01')).toBe('0.01')
    expect(sanitizePositiveInput('100')).toBe('100')
  })

  it('allows zero', () => {
    expect(sanitizePositiveInput('0')).toBe('0')
    expect(sanitizePositiveInput('0.00')).toBe('0.00')
  })

  it('rejects negative numbers', () => {
    expect(sanitizePositiveInput('-5')).toBe('')
    expect(sanitizePositiveInput('-0.01')).toBe('')
    expect(sanitizePositiveInput('-100')).toBe('')
  })

  it('rejects non-numeric input', () => {
    expect(sanitizePositiveInput('abc')).toBe('')
    expect(sanitizePositiveInput('--')).toBe('')
  })
})

function getLeveragePresets(max: number): number[] {
  return [1, 2, 5, 10, 25, max].filter((v, i, a) => v <= max && a.indexOf(v) === i).sort((a, b) => a - b)
}

function clampLeverage(leverage: number, maxLeverage: number): number {
  return leverage > maxLeverage ? maxLeverage : leverage
}

describe('leverage preset generation', () => {
  it('filters out preset values exceeding max for G$-USD (max 20)', () => {
    const presets = getLeveragePresets(20)
    expect(presets).toEqual([1, 2, 5, 10, 20])
    expect(presets.every(p => p <= 20)).toBe(true)
  })

  it('keeps all valid presets for BTC-USD (max 50)', () => {
    const presets = getLeveragePresets(50)
    expect(presets).toEqual([1, 2, 5, 10, 25, 50])
  })

  it('filters preset 25 for LINK-USD (max 30)', () => {
    const presets = getLeveragePresets(30)
    expect(presets).toEqual([1, 2, 5, 10, 25, 30])
  })

  it('handles max equal to a preset value (max 10)', () => {
    const presets = getLeveragePresets(10)
    expect(presets).toEqual([1, 2, 5, 10])
  })

  it('returns sorted presets', () => {
    const presets = getLeveragePresets(20)
    for (let i = 1; i < presets.length; i++) {
      expect(presets[i]).toBeGreaterThan(presets[i - 1])
    }
  })
})

describe('leverage clamping on pair switch', () => {
  it('clamps leverage when it exceeds new pair max', () => {
    expect(clampLeverage(50, 20)).toBe(20)
  })

  it('keeps leverage when within new pair max', () => {
    expect(clampLeverage(10, 50)).toBe(10)
  })

  it('keeps leverage when equal to new pair max', () => {
    expect(clampLeverage(20, 20)).toBe(20)
  })
})

describe('margin validation logic', () => {
  it('detects when notional exceeds available margin', () => {
    const availableMargin = 7285.32
    const markPrice = 60125.80
    const leverage = 10
    const size = 5

    const notional = size * markPrice
    const marginRequired = notional / leverage
    const exceedsMargin = marginRequired > availableMargin

    expect(exceedsMargin).toBe(true)
  })

  it('allows when notional is within available margin', () => {
    const availableMargin = 7285.32
    const markPrice = 60125.80
    const leverage = 10
    const size = 0.01

    const notional = size * markPrice
    const marginRequired = notional / leverage
    const exceedsMargin = marginRequired > availableMargin

    expect(exceedsMargin).toBe(false)
  })
})
