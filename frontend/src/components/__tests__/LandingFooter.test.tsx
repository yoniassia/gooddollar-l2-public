import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingFooter } from '../LandingFooter'

describe('LandingFooter', () => {
  it('renders brand text', () => {
    render(<LandingFooter />)
    expect(screen.getByText(/Powered by GoodDollar L2/i)).toBeInTheDocument()
  })

  it('does not show Chain ID', () => {
    render(<LandingFooter />)
    expect(screen.queryByText(/Chain ID/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/42069/)).not.toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<LandingFooter />)
    expect(screen.getByText('Docs')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('Community')).toBeInTheDocument()
  })

  it('links point to real external URLs (not #)', () => {
    render(<LandingFooter />)
    const docsLink = screen.getByText('Docs').closest('a')
    expect(docsLink).toHaveAttribute('href', 'https://docs.gooddollar.org')
    const githubLink = screen.getByText('GitHub').closest('a')
    expect(githubLink).toHaveAttribute('href', 'https://github.com/GoodDollar')
    const communityLink = screen.getByText('Community').closest('a')
    expect(communityLink).toHaveAttribute('href', 'https://community.gooddollar.org')
  })

  it('external links open in new tabs with proper rel attribute', () => {
    render(<LandingFooter />)
    const links = screen.getAllByRole('link')
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})
