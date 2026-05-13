import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TestWrapper } from '@/test-utils/wrapper'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/components/TokenIcon', () => ({
  TokenIcon: ({ symbol }: { symbol: string }) => <span data-testid={`icon-${symbol}`}>{symbol}</span>,
}))

vi.mock('@/lib/useOnChainMarketData', () => ({
  TOKEN_COLORS: {} as Record<string, string>,
  useOnChainMarketData: () => ({ isLive: true, isLoading: false, tokens: [
    {
      symbol: 'ETH', name: 'Ether', icon: '', decimals: 18, address: '0x0',
      category: 'Infrastructure' as const, color: '#627EEA',
      price: 3500, change1h: 0.5, change24h: 1.2, change7d: -2.0,
      volume24h: 1e9, marketCap: 4e11, sparkline7d: [3400, 3450, 3500],
      description: 'Ethereum',
    },
    {
      symbol: 'G$', name: 'GoodDollar', icon: '', decimals: 18, address: '0x1',
      category: 'GoodDollar' as const, color: '#00B0A0',
      price: 0.0002, change1h: 0.1, change24h: -0.5, change7d: 1.0,
      volume24h: 5e5, marketCap: 1e7, sparkline7d: [0.00019, 0.0002, 0.00021],
      description: 'GoodDollar UBI token',
    },
  ]}),
}))

import ExplorePage from '../page'

describe('ExplorePage', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('renders token data immediately without artificial delay', () => {
    render(<TestWrapper><ExplorePage /></TestWrapper>)
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)
  })

  it('navigates to token detail page when row is clicked', () => {
    render(<TestWrapper><ExplorePage /></TestWrapper>)
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)
    fireEvent.click(rows[1])
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/explore/'))
  })

  it('shows a Swap button on each data row', () => {
    render(<TestWrapper><ExplorePage /></TestWrapper>)
    const swapButtons = screen.getAllByRole('button', { name: /swap/i })
    expect(swapButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('Swap button click navigates to swap with ?buy= param', () => {
    render(<TestWrapper><ExplorePage /></TestWrapper>)
    const swapButtons = screen.getAllByRole('button', { name: /swap/i })
    fireEvent.click(swapButtons[0])
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/?buy='))
  })
})
