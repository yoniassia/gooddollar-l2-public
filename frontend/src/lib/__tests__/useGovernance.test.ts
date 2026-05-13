import { describe, it, expect } from 'vitest'
import {
  proposalStateName,
  proposalStateColor,
  proposalStateBg,
  formatDuration,
  formatVotes,
} from '@/lib/useGovernance'

describe('proposalStateName', () => {
  it('maps state numbers to names', () => {
    expect(proposalStateName(0)).toBe('Pending')
    expect(proposalStateName(1)).toBe('Active')
    expect(proposalStateName(2)).toBe('Canceled')
    expect(proposalStateName(3)).toBe('Defeated')
    expect(proposalStateName(4)).toBe('Succeeded')
    expect(proposalStateName(5)).toBe('Queued')
    expect(proposalStateName(6)).toBe('Executed')
    expect(proposalStateName(7)).toBe('Expired')
  })

  it('defaults to Pending for out-of-range', () => {
    expect(proposalStateName(99)).toBe('Pending')
  })
})

describe('proposalStateColor', () => {
  it('returns blue for Active', () => {
    expect(proposalStateColor('Active')).toContain('blue')
  })

  it('returns green for Succeeded', () => {
    expect(proposalStateColor('Succeeded')).toContain('green')
  })

  it('returns emerald for Executed', () => {
    expect(proposalStateColor('Executed')).toContain('emerald')
  })

  it('returns red for Defeated', () => {
    expect(proposalStateColor('Defeated')).toContain('red')
  })
})

describe('proposalStateBg', () => {
  it('returns styled background for each state', () => {
    expect(proposalStateBg('Active')).toContain('blue')
    expect(proposalStateBg('Executed')).toContain('emerald')
    expect(proposalStateBg('Defeated')).toContain('red')
    expect(proposalStateBg('Pending')).toContain('yellow')
  })
})

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(300)).toBe('5m')
    expect(formatDuration(1800)).toBe('30m')
  })

  it('formats hours', () => {
    expect(formatDuration(3600)).toBe('1h')
    expect(formatDuration(7200)).toBe('2h')
  })

  it('formats days', () => {
    expect(formatDuration(86400)).toBe('1d')
    expect(formatDuration(86400 * 7)).toBe('7d')
  })

  it('formats months', () => {
    expect(formatDuration(86400 * 30)).toBe('1.0mo')
    expect(formatDuration(86400 * 90)).toBe('3.0mo')
  })

  it('formats years', () => {
    expect(formatDuration(86400 * 365)).toBe('1.0y')
    expect(formatDuration(86400 * 365 * 4)).toBe('4.0y')
  })
})

describe('formatVotes', () => {
  it('formats small values', () => {
    const result = formatVotes(BigInt('500000000000000000000')) // 500
    expect(result).toBe('500')
  })

  it('formats thousands', () => {
    const result = formatVotes(BigInt('5000000000000000000000')) // 5000
    expect(result).toBe('5.0K')
  })

  it('formats millions', () => {
    const result = formatVotes(BigInt('2000000000000000000000000')) // 2M
    expect(result).toBe('2.0M')
  })

  it('formats zero', () => {
    expect(formatVotes(0n)).toBe('0')
  })
})
