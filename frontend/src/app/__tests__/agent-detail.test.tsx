import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AgentDetailPage from '../agents/[address]/page'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ address: '0x1002aabbccdd' }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

// Mock wagmi
vi.mock('wagmi', () => ({
  useReadContract: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
  useReadContracts: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
  useAccount: vi.fn().mockReturnValue({ address: undefined }),
}))

const MOCK_PROFILE = {
  name: 'DeltaNeutral',
  avatarURI: '',
  strategy: 'Delta-neutral hedging across perps and lending',
  owner: '0xOwner1234567890abcdef',
  registeredAt: 1711900000,
  active: true,
}

const MOCK_STATS = {
  totalTrades: 42,
  totalVolume: '1,234.5678',
  totalVolumeRaw: BigInt('1234567800000000000000'),
  totalFeesGenerated: '12.3456',
  totalFeesRaw: BigInt('12345600000000000000'),
  ubiContribution: '4.1148',
  ubiContributionRaw: BigInt('4114800000000000000'),
  totalPnL: '3.5',
  pnlPositive: true,
  lastActiveAt: 1711990000,
}

const MOCK_BREAKDOWN = [
  { protocol: 'perps' as const, trades: 20, volume: '800', volumeRaw: 0n, fees: '8.0', feesRaw: 0n },
  { protocol: 'lend' as const, trades: 15, volume: '300', volumeRaw: 0n, fees: '3.0', feesRaw: 0n },
  { protocol: 'swap' as const, trades: 7, volume: '134.5', volumeRaw: 0n, fees: '1.345', feesRaw: 0n },
]

// Mock useAgentDetail
vi.mock('@/lib/useAgentDetail', () => ({
  useAgentDetail: vi.fn().mockReturnValue({
    profile: null,
    stats: null,
    protocolBreakdown: [],
    isLoading: false,
    allProtocols: ['swap', 'perps', 'predict', 'lend', 'stable', 'stocks', 'yield'],
  }),
}))

import { useAgentDetail } from '@/lib/useAgentDetail'
const mockUseAgentDetail = useAgentDetail as unknown as ReturnType<typeof vi.fn>

describe('AgentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: null, stats: null, protocolBreakdown: [], isLoading: true, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('Loading agent data…')).toBeDefined()
  })

  it('shows not found for unregistered agent', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: null, stats: null, protocolBreakdown: [], isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('Agent Not Found')).toBeDefined()
  })

  it('renders agent profile header', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE, stats: MOCK_STATS, protocolBreakdown: [], isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('DeltaNeutral')).toBeDefined()
    expect(screen.getByText('Active')).toBeDefined()
    expect(screen.getByText('Delta-neutral hedging across perps and lending')).toBeDefined()
  })

  it('renders stats grid', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE, stats: MOCK_STATS, protocolBreakdown: [], isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('42')).toBeDefined()
    expect(screen.getByText('4.1148 ETH')).toBeDefined()
  })

  it('renders UBI breakdown section', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE, stats: MOCK_STATS, protocolBreakdown: [], isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('Fee & UBI Breakdown')).toBeDefined()
    expect(screen.getByText('→ UBI Pool (33%)')).toBeDefined()
  })

  it('renders protocol breakdown cards', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE, stats: MOCK_STATS, protocolBreakdown: MOCK_BREAKDOWN, isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('Perpetuals')).toBeDefined()
    expect(screen.getByText('Lending')).toBeDefined()
    expect(screen.getByText('Swaps')).toBeDefined()
  })

  it('shows empty state when no protocol activity', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE, stats: MOCK_STATS, protocolBreakdown: [], isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('No protocol activity recorded yet')).toBeDefined()
  })

  it('renders P&L with correct sign', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE, stats: MOCK_STATS, protocolBreakdown: [], isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('+3.5 ETH')).toBeDefined()
    expect(screen.getByText('🟢 Profitable')).toBeDefined()
  })

  it('renders negative P&L', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE,
      stats: { ...MOCK_STATS, pnlPositive: false },
      protocolBreakdown: [],
      isLoading: false,
      allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('-3.5 ETH')).toBeDefined()
    expect(screen.getByText('🔴 In the red')).toBeDefined()
  })

  it('has back link to leaderboard', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE, stats: MOCK_STATS, protocolBreakdown: [], isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    const backLink = screen.getByText('← Leaderboard')
    expect(backLink.closest('a')?.getAttribute('href')).toBe('/agents')
  })

  it('renders explorer link', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: MOCK_PROFILE, stats: MOCK_STATS, protocolBreakdown: [], isLoading: false, allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('View on Explorer →')).toBeDefined()
  })

  it('shows inactive badge for deactivated agents', () => {
    mockUseAgentDetail.mockReturnValue({
      profile: { ...MOCK_PROFILE, active: false },
      stats: MOCK_STATS,
      protocolBreakdown: [],
      isLoading: false,
      allProtocols: [],
    })
    render(<AgentDetailPage />)
    expect(screen.getByText('Inactive')).toBeDefined()
  })
})
