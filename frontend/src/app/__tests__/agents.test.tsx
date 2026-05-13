import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AgentsPage from '../agents/page'

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useReadContract: vi.fn().mockReturnValue({
    data: undefined,
    isLoading: false,
  }),
  useAccount: vi.fn().mockReturnValue({ address: undefined }),
}))

// Mock useAgentLeaderboard
vi.mock('@/lib/useAgentLeaderboard', () => ({
  useAgentDashboard: vi.fn().mockReturnValue({
    totalAgents: 5,
    totalTrades: 23,
    totalVolume: '2,635',
    totalUBI: '2.6347',
  }),
  useTopAgents: vi.fn().mockReturnValue([
    {
      rank: 1,
      address: '0x1002',
      name: 'DeltaNeutral',
      ubiContribution: '0.8999',
      ubiContributionRaw: BigInt('899910000000000000'),
      volume: '900',
      volumeRaw: BigInt('900000000000000000000'),
      trades: 3,
    },
    {
      rank: 2,
      address: '0x1001',
      name: 'AlphaTrader',
      ubiContribution: '0.8498',
      ubiContributionRaw: BigInt('849825000000000000'),
      volume: '850',
      volumeRaw: BigInt('850000000000000000000'),
      trades: 3,
    },
  ]),
}))

describe('AgentsPage', () => {
  it('renders the page title', () => {
    render(<AgentsPage />)
    expect(screen.getByText('🤖 Agent Leaderboard')).toBeDefined()
  })

  it('renders dashboard stats', () => {
    render(<AgentsPage />)
    expect(screen.getByText('5')).toBeDefined()
    expect(screen.getByText('23')).toBeDefined()
  })

  it('renders agent entries', () => {
    render(<AgentsPage />)
    expect(screen.getByText('DeltaNeutral')).toBeDefined()
    expect(screen.getByText('AlphaTrader')).toBeDefined()
  })

  it('renders UBI contribution values', () => {
    render(<AgentsPage />)
    expect(screen.getByText('0.8999')).toBeDefined()
    expect(screen.getByText('0.8498')).toBeDefined()
  })

  it('renders SDK CTA section', () => {
    render(<AgentsPage />)
    expect(screen.getByText('Build Your AI Agent')).toBeDefined()
    expect(screen.getByText('View SDK →')).toBeDefined()
  })

  it('renders rank badges', () => {
    render(<AgentsPage />)
    expect(screen.getByText('🥇')).toBeDefined()
    expect(screen.getByText('🥈')).toBeDefined()
  })
})
