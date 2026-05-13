import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TokenSelector, TOKENS } from '../TokenSelector'

describe('TokenSelector', () => {
  const defaultProps = {
    selected: TOKENS[1], // ETH
    onSelect: vi.fn(),
    exclude: 'G$',
  }

  async function openModal() {
    fireEvent.click(screen.getByText('ETH'))
    await waitFor(() => {
      expect(screen.getByText('Select a token')).toBeInTheDocument()
    })
  }

  it('opens modal on click', async () => {
    render(<TokenSelector {...defaultProps} />)
    await openModal()
    expect(screen.getByPlaceholderText('Search by name or symbol')).toBeInTheDocument()
  })

  it('shows token list including USDC in modal', async () => {
    render(<TokenSelector {...defaultProps} />)
    await openModal()
    expect(screen.getByRole('option', { name: /USDC/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /WBTC/i })).toBeInTheDocument()
  })

  it('filters tokens by search query', async () => {
    render(<TokenSelector {...defaultProps} />)
    await openModal()
    const search = screen.getByPlaceholderText('Search by name or symbol')
    fireEvent.change(search, { target: { value: 'bit' } })
    expect(screen.getByRole('option', { name: /WBTC/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /USDC/i })).not.toBeInTheDocument()
  })

  it('closes modal on close button click', async () => {
    render(<TokenSelector {...defaultProps} />)
    await openModal()
    fireEvent.click(screen.getByLabelText('Close'))
    await waitFor(() => {
      expect(screen.queryByText('Select a token')).not.toBeInTheDocument()
    })
  })

  it('selects a token and closes modal', async () => {
    const onSelect = vi.fn()
    render(<TokenSelector {...defaultProps} onSelect={onSelect} />)
    await openModal()
    fireEvent.click(screen.getByRole('option', { name: /USDC/i }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'USDC' }))
    await waitFor(() => {
      expect(screen.queryByText('Select a token')).not.toBeInTheDocument()
    })
  })

  it('shows checkmark on currently selected token', async () => {
    render(<TokenSelector {...defaultProps} />)
    await openModal()
    const ethOption = screen.getByRole('option', { name: /^ETH/i })
    expect(ethOption.querySelector('svg')).toBeTruthy()
  })

  it('dims and disables excluded token', async () => {
    render(<TokenSelector {...defaultProps} exclude="USDC" />)
    await openModal()
    const usdcOption = screen.getByRole('option', { name: /USDC/i })
    expect(usdcOption).toBeDisabled()
  })

  it('shows all tokens when search is whitespace only', async () => {
    render(<TokenSelector {...defaultProps} />)
    await openModal()
    const search = screen.getByPlaceholderText('Search by name or symbol')
    fireEvent.change(search, { target: { value: '   ' } })
    expect(screen.getByRole('option', { name: /USDC/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /WBTC/i })).toBeInTheDocument()
  })

  it('trims whitespace around search queries', async () => {
    render(<TokenSelector {...defaultProps} />)
    await openModal()
    const search = screen.getByPlaceholderText('Search by name or symbol')
    fireEvent.change(search, { target: { value: '  ETH  ' } })
    expect(screen.getByRole('option', { name: /^ETH/i })).toBeInTheDocument()
  })

  it('shows popular tokens as quick-pick pills', async () => {
    render(<TokenSelector {...defaultProps} />)
    await openModal()
    const pills = screen.getAllByRole('button').filter(
      btn => btn.classList.contains('rounded-full')
    )
    expect(pills.length).toBeGreaterThanOrEqual(3)
  })
})
