import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeeBreakdownBadge } from '../FeeBreakdownBadge'

describe('FeeBreakdownBadge', () => {
  it('renders the badge with UBI text', () => {
    render(<FeeBreakdownBadge />)
    expect(screen.getByText(/funds UBI/i)).toBeInTheDocument()
  })

  it('does not show popover by default', () => {
    render(<FeeBreakdownBadge />)
    expect(screen.queryByText('UBI Pool')).not.toBeInTheDocument()
  })

  it('shows popover on click', async () => {
    const user = userEvent.setup()
    render(<FeeBreakdownBadge />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('UBI Pool')).toBeInTheDocument()
    expect(screen.getByText('Protocol')).toBeInTheDocument()
    expect(screen.getByText('Liquidity Providers')).toBeInTheDocument()
  })

  it('shows fee percentages in popover', async () => {
    const user = userEvent.setup()
    render(<FeeBreakdownBadge />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('33%')).toBeInTheDocument()
    expect(screen.getByText('17%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('closes popover on Escape', async () => {
    const user = userEvent.setup()
    render(<FeeBreakdownBadge />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('UBI Pool')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('UBI Pool')).not.toBeInTheDocument()
  })

  it('closes popover on second click', async () => {
    const user = userEvent.setup()
    render(<FeeBreakdownBadge />)
    const btn = screen.getByRole('button')
    await user.click(btn)
    expect(screen.getByText('UBI Pool')).toBeInTheDocument()
    await user.click(btn)
    expect(screen.queryByText('UBI Pool')).not.toBeInTheDocument()
  })

  it('shows total fee info', async () => {
    const user = userEvent.setup()
    render(<FeeBreakdownBadge />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText(/0\.3% total fee/i)).toBeInTheDocument()
  })
})
