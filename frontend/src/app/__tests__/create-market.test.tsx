import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected: true }),
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
}))

vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: {
    Custom: ({ children }: { children: (props: { openConnectModal: () => void }) => React.ReactNode }) =>
      children({ openConnectModal: vi.fn() }),
  },
}))

import CreateMarketPage from '../predict/create/page'

function setEndDate(container: HTMLElement, value: string) {
  const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
  fireEvent.change(dateInput, { target: { value } })
}

function tomorrowISODate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

describe('CreateMarketPage — input constraints and counters', () => {
  it('renders character counters with initial 0/200 and 0/500', () => {
    render(<CreateMarketPage />)
    expect(screen.getByText('0/200')).toBeInTheDocument()
    expect(screen.getByText('0/500')).toBeInTheDocument()
  })

  it('updates question character counter as user types', async () => {
    const user = userEvent.setup()
    render(<CreateMarketPage />)
    const q = screen.getByPlaceholderText(/Will X happen/i)
    await user.type(q, 'hello')
    expect(screen.getByText('5/200')).toBeInTheDocument()
  })

  it('applies amber counter color at 80% of question max (160/200)', () => {
    render(<CreateMarketPage />)
    const q = screen.getByPlaceholderText(/Will X happen/i) as HTMLInputElement
    fireEvent.change(q, { target: { value: 'a'.repeat(160) } })
    const counter = screen.getByText('160/200')
    expect(counter).toHaveClass('text-amber-500')
  })

  it('applies red counter color at 100% of question max (200/200)', () => {
    render(<CreateMarketPage />)
    const q = screen.getByPlaceholderText(/Will X happen/i) as HTMLInputElement
    fireEvent.change(q, { target: { value: 'a'.repeat(200) } })
    const counter = screen.getByText('200/200')
    expect(counter).toHaveClass('text-red-400')
  })

  it('applies amber at 80% and red at 100% for resolution criteria counter', () => {
    render(<CreateMarketPage />)
    const ta = screen.getByPlaceholderText(/How will this market be resolved/i) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'b'.repeat(400) } })
    expect(screen.getByText('400/500')).toHaveClass('text-amber-500')
    fireEvent.change(ta, { target: { value: 'b'.repeat(500) } })
    expect(screen.getByText('500/500')).toHaveClass('text-red-400')
  })

  it('shows submit validation when liquidity is empty', async () => {
    const user = userEvent.setup()
    const { container } = render(<CreateMarketPage />)
    fireEvent.change(screen.getByPlaceholderText(/Will X happen/i), { target: { value: 'Q?' } })
    fireEvent.change(screen.getByPlaceholderText(/How will this market be resolved/i), { target: { value: 'Criteria' } })
    setEndDate(container, tomorrowISODate())
    await user.click(screen.getByRole('button', { name: /Create Market/i }))
    expect(screen.getByText('Initial liquidity is required')).toBeInTheDocument()
  })

  it('shows minimum liquidity message when value is below 100', async () => {
    const user = userEvent.setup()
    const { container } = render(<CreateMarketPage />)
    fireEvent.change(screen.getByPlaceholderText(/Will X happen/i), { target: { value: 'Q?' } })
    fireEvent.change(screen.getByPlaceholderText(/How will this market be resolved/i), { target: { value: 'Criteria' } })
    setEndDate(container, tomorrowISODate())
    fireEvent.change(screen.getByPlaceholderText(/^Min \$100$/), { target: { value: '50' } })
    await user.click(screen.getByRole('button', { name: /Create Market/i }))
    expect(screen.getByText('Minimum $100 initial liquidity')).toBeInTheDocument()
  })

  it('shows maximum liquidity message when value is above 100,000', async () => {
    const user = userEvent.setup()
    const { container } = render(<CreateMarketPage />)
    fireEvent.change(screen.getByPlaceholderText(/Will X happen/i), { target: { value: 'Q?' } })
    fireEvent.change(screen.getByPlaceholderText(/How will this market be resolved/i), { target: { value: 'Criteria' } })
    setEndDate(container, tomorrowISODate())
    fireEvent.change(screen.getByPlaceholderText(/^Min \$100$/), { target: { value: '100001' } })
    await user.click(screen.getByRole('button', { name: /Create Market/i }))
    expect(screen.getByText('Maximum $100,000 initial liquidity')).toBeInTheDocument()
  })

  it('shows inline liquidity validation while typing out-of-range values', () => {
    render(<CreateMarketPage />)
    const liq = screen.getByPlaceholderText(/^Min \$100$/) as HTMLInputElement
    fireEvent.change(liq, { target: { value: '99' } })
    expect(screen.getByText('Minimum $100 initial liquidity')).toBeInTheDocument()
    fireEvent.change(liq, { target: { value: '100001' } })
    expect(screen.getByText('Maximum $100,000 initial liquidity')).toBeInTheDocument()
  })

  it('uses text input with inputMode decimal for liquidity (not type number)', () => {
    render(<CreateMarketPage />)
    const liq = screen.getByPlaceholderText(/^Min \$100$/)
    expect(liq).toHaveAttribute('type', 'text')
    expect(liq).toHaveAttribute('inputmode', 'decimal')
  })
})
