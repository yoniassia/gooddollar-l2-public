import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ─── Wagmi mocks ──────────────────────────────────────────────────────────────

vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  useReadContract: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}))

vi.mock('@/lib/useGoodStable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/useGoodStable')>()
  return {
    ...actual,
    useGUSDBalance: vi.fn().mockReturnValue({ balance: BigInt(0), balanceFloat: 0, isLoading: false }),
    useVault: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  }
})

vi.mock('@/lib/useGoodLend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/useGoodLend')>()
  return {
    ...actual,
    useUserAccountData: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  }
})

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import { useAccount } from 'wagmi'
import { PortfolioOnChain } from '../PortfolioOnChain'

const mockAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`

describe('PortfolioOnChain', () => {
  beforeEach(() => {
    vi.mocked(useAccount).mockReset()
  })

  it('renders nothing when wallet not connected', () => {
    vi.mocked(useAccount).mockReturnValue({ address: undefined, chainId: undefined } as ReturnType<typeof useAccount>)
    const { container } = render(<PortfolioOnChain />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when connected to wrong chain', () => {
    vi.mocked(useAccount).mockReturnValue({ address: mockAddress, chainId: 1 } as ReturnType<typeof useAccount>)
    const { container } = render(<PortfolioOnChain />)
    expect(container.firstChild).toBeNull()
  })

  it('renders on-chain section when connected to chain 42069', () => {
    vi.mocked(useAccount).mockReturnValue({ address: mockAddress, chainId: 42069 } as ReturnType<typeof useAccount>)
    render(<PortfolioOnChain />)
    expect(screen.getByText('On-Chain Positions')).toBeInTheDocument()
  })

  it('shows devnet chain ID label when connected', () => {
    vi.mocked(useAccount).mockReturnValue({ address: mockAddress, chainId: 42069 } as ReturnType<typeof useAccount>)
    render(<PortfolioOnChain />)
    expect(screen.getByText(/devnet chain 42069/)).toBeInTheDocument()
  })

  it('shows G$ Balance label', () => {
    vi.mocked(useAccount).mockReturnValue({ address: mockAddress, chainId: 42069 } as ReturnType<typeof useAccount>)
    render(<PortfolioOnChain />)
    expect(screen.getByText('G$ Balance')).toBeInTheDocument()
  })

  it('shows gUSD Balance label', () => {
    vi.mocked(useAccount).mockReturnValue({ address: mockAddress, chainId: 42069 } as ReturnType<typeof useAccount>)
    render(<PortfolioOnChain />)
    expect(screen.getByText('gUSD Balance')).toBeInTheDocument()
  })

  it('shows GoodLend section', () => {
    vi.mocked(useAccount).mockReturnValue({ address: mockAddress, chainId: 42069 } as ReturnType<typeof useAccount>)
    render(<PortfolioOnChain />)
    expect(screen.getByText('GoodLend')).toBeInTheDocument()
  })

  it('shows GoodStable section', () => {
    vi.mocked(useAccount).mockReturnValue({ address: mockAddress, chainId: 42069 } as ReturnType<typeof useAccount>)
    render(<PortfolioOnChain />)
    expect(screen.getByText('GoodStable')).toBeInTheDocument()
  })

  it('shows manage links for GoodLend and GoodStable', () => {
    vi.mocked(useAccount).mockReturnValue({ address: mockAddress, chainId: 42069 } as ReturnType<typeof useAccount>)
    render(<PortfolioOnChain />)
    const manageLinks = screen.getAllByRole('link', { name: /Manage/i })
    expect(manageLinks.length).toBeGreaterThanOrEqual(2)
  })
})
