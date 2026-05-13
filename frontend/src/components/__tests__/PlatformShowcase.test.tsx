import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

import { PlatformShowcase } from '@/components/PlatformShowcase'

describe('PlatformShowcase', () => {
  it('renders the section heading', () => {
    render(<PlatformShowcase />)
    expect(screen.getByText('Explore the Platform')).toBeInTheDocument()
  })

  it('renders all 6 product cards', () => {
    render(<PlatformShowcase />)
    expect(screen.getByText('GoodSwap')).toBeInTheDocument()
    expect(screen.getByText('GoodStocks')).toBeInTheDocument()
    expect(screen.getByText('GoodPredict')).toBeInTheDocument()
    expect(screen.getByText('GoodPerps')).toBeInTheDocument()
    expect(screen.getByText('GoodLend')).toBeInTheDocument()
    expect(screen.getByText('GoodStable')).toBeInTheDocument()
  })

  it('links to correct product sections', () => {
    render(<PlatformShowcase />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/swap')
    expect(hrefs).toContain('/stocks')
    expect(hrefs).toContain('/predict')
    expect(hrefs).toContain('/perps')
    expect(hrefs).toContain('/lend')
    expect(hrefs).toContain('/stable')
  })

  it('shows CTA text for each product', () => {
    render(<PlatformShowcase />)
    expect(screen.getByText(/Start Swapping/)).toBeInTheDocument()
    expect(screen.getByText(/View Stocks/)).toBeInTheDocument()
    expect(screen.getByText(/View Markets/)).toBeInTheDocument()
    expect(screen.getByText(/Trade Perps/)).toBeInTheDocument()
    expect(screen.getByText(/Lend Now/)).toBeInTheDocument()
    expect(screen.getByText(/Open Vault/)).toBeInTheDocument()
  })
})
