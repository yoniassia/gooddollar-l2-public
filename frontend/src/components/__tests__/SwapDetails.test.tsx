import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SwapDetails } from '../SwapDetails'

describe('SwapDetails', () => {
  const defaultProps = {
    priceImpact: 0.3,
    minimumReceived: '99,700',
    outputSymbol: 'G$',
    networkFee: '< $0.01',
    visible: true,
  }

  it('renders when visible', () => {
    render(<SwapDetails {...defaultProps} />)
    expect(screen.getByText('Price Impact')).toBeInTheDocument()
  })

  it('does not render when not visible', () => {
    render(<SwapDetails {...defaultProps} visible={false} />)
    expect(screen.queryByText('Price Impact')).not.toBeInTheDocument()
  })

  it('shows price impact value', () => {
    render(<SwapDetails {...defaultProps} />)
    expect(screen.getByText('0.30%')).toBeInTheDocument()
  })

  it('shows minimum received', () => {
    render(<SwapDetails {...defaultProps} />)
    expect(screen.getByText('99,700 G$')).toBeInTheDocument()
  })

  it('shows network fee', () => {
    render(<SwapDetails {...defaultProps} />)
    expect(screen.getByText('< $0.01')).toBeInTheDocument()
  })

  it('colors price impact green for low values', () => {
    const { container } = render(<SwapDetails {...defaultProps} priceImpact={0.3} />)
    const impactEl = container.querySelector('[data-testid="price-impact"]')
    expect(impactEl?.className).toContain('text-goodgreen')
  })

  it('colors price impact yellow for medium values', () => {
    const { container } = render(<SwapDetails {...defaultProps} priceImpact={3} />)
    const impactEl = container.querySelector('[data-testid="price-impact"]')
    expect(impactEl?.className).toContain('text-yellow')
  })

  it('colors price impact red for high values', () => {
    const { container } = render(<SwapDetails {...defaultProps} priceImpact={8} />)
    const impactEl = container.querySelector('[data-testid="price-impact"]')
    expect(impactEl?.className).toContain('text-red')
  })

  it('toggles expanded state on click', () => {
    render(<SwapDetails {...defaultProps} />)
    const toggle = screen.getByRole('button')
    expect(screen.getByText('Minimum Received')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('Minimum Received')).not.toBeInTheDocument()
  })
})
