import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PriceImpactWarning } from '../PriceImpactWarning'

describe('PriceImpactWarning', () => {
  it('does not render when price impact is below 5%', () => {
    const { container } = render(<PriceImpactWarning priceImpact={4.99} />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when not visible', () => {
    const { container } = render(<PriceImpactWarning priceImpact={8} visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders warning at 5% threshold', () => {
    render(<PriceImpactWarning priceImpact={5} />)
    expect(screen.getByTestId('price-impact-warning')).toBeInTheDocument()
    expect(screen.getByText(/5\.00%/)).toBeInTheDocument()
  })

  it('uses yellow/orange styling for 5-10% impact', () => {
    render(<PriceImpactWarning priceImpact={7} />)
    const el = screen.getByTestId('price-impact-warning')
    expect(el.className).toContain('yellow')
  })

  it('uses red styling for >= 10% impact', () => {
    render(<PriceImpactWarning priceImpact={12} />)
    const el = screen.getByTestId('price-impact-warning')
    expect(el.className).toContain('red')
  })

  it('shows correct warning message', () => {
    render(<PriceImpactWarning priceImpact={8.5} />)
    expect(screen.getByText(/8\.50%/)).toBeInTheDocument()
    expect(screen.getByText(/significantly less/i)).toBeInTheDocument()
  })
})
