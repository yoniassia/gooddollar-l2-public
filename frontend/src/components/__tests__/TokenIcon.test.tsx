import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TokenIcon } from '../TokenIcon'

describe('TokenIcon', () => {
  it('renders G$ SVG logo', () => {
    const { container } = render(<TokenIcon symbol="G$" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.querySelector('circle')).toBeInTheDocument()
    expect(svg?.textContent).toContain('G$')
  })

  it('renders ETH SVG logo', () => {
    const { container } = render(<TokenIcon symbol="ETH" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('renders USDC SVG logo', () => {
    const { container } = render(<TokenIcon symbol="USDC" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders SVG fallback for unknown tokens', () => {
    const { container } = render(<TokenIcon symbol="DOGE" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.textContent).toContain('DOG')
  })

  it('applies custom size', () => {
    const { container } = render(<TokenIcon symbol="ETH" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
  })

  it('applies custom className', () => {
    const { container } = render(<TokenIcon symbol="ETH" className="ml-2" />)
    expect(container.firstElementChild?.className).toContain('ml-2')
  })
})
