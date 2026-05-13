import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Header } from '../Header'

vi.mock('../WalletButton', () => ({
  WalletButton: () => <button>Connect Wallet</button>,
}))

vi.mock('../ActivityButton', () => ({
  ActivityButton: () => <button aria-label="Recent activity">Activity</button>,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

describe('Header', () => {
  it('renders logo and brand name', () => {
    render(<Header />)
    expect(screen.getByText('GoodDollar')).toBeInTheDocument()
    expect(screen.getByText('G$')).toBeInTheDocument()
  })

  it('renders desktop nav links', () => {
    render(<Header />)
    expect(screen.getByText('Swap')).toBeInTheDocument()
    expect(screen.getByText('Explore')).toBeInTheDocument()
    const poolLinks = screen.getAllByText('Pool')
    expect(poolLinks.length).toBeGreaterThanOrEqual(1)
    const bridgeLinks = screen.getAllByText('Bridge')
    expect(bridgeLinks.length).toBeGreaterThanOrEqual(1)
    const lendLinks = screen.getAllByText('Lend')
    expect(lendLinks.length).toBeGreaterThanOrEqual(1)
    const stableLinks = screen.getAllByText('Stable')
    expect(stableLinks.length).toBeGreaterThanOrEqual(1)
  })

  it('renders Pool and Bridge as links to their pages', () => {
    render(<Header />)
    const poolLink = screen.getAllByText('Pool').find(el => el.closest('a'))
    expect(poolLink?.closest('a')).toHaveAttribute('href', '/pool')
    const bridgeLink = screen.getAllByText('Bridge').find(el => el.closest('a'))
    expect(bridgeLink?.closest('a')).toHaveAttribute('href', '/bridge')
  })

  it('renders hamburger button for mobile', () => {
    render(<Header />)
    const hamburger = screen.getByLabelText('Open menu')
    expect(hamburger).toBeInTheDocument()
  })

  it('opens mobile menu on hamburger click', () => {
    render(<Header />)
    const hamburger = screen.getByLabelText('Open menu')
    fireEvent.click(hamburger)

    const mobileNav = screen.getByTestId('mobile-nav')
    expect(mobileNav).toBeInTheDocument()
    expect(mobileNav.textContent).toContain('Swap')
    expect(mobileNav.textContent).toContain('Pool')
    expect(mobileNav.textContent).toContain('Bridge')
  })

  it('closes mobile menu on close button click', () => {
    render(<Header />)
    fireEvent.click(screen.getByLabelText('Open menu'))
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Close menu'))
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument()
  })

  it('closes mobile menu on Escape key', () => {
    render(<Header />)
    fireEvent.click(screen.getByLabelText('Open menu'))
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument()
  })

  it('Pool and Bridge in desktop nav have no Soon badges', () => {
    render(<Header />)
    const desktopNav = document.querySelector('nav.hidden.sm\\:flex')!
    const soonBadges = desktopNav.querySelectorAll('[data-testid="soon-badge"]')
    expect(soonBadges.length).toBe(0)
  })

  it('Pool and Bridge in mobile menu have no Coming Soon badges', () => {
    render(<Header />)
    fireEvent.click(screen.getByLabelText('Open menu'))

    const mobileNav = screen.getByTestId('mobile-nav')
    expect(mobileNav.textContent).not.toContain('Coming Soon')
  })

  it('has Pool and Bridge as navigable links in mobile menu', () => {
    render(<Header />)
    fireEvent.click(screen.getByLabelText('Open menu'))

    const mobileNav = screen.getByTestId('mobile-nav')
    const links = mobileNav.querySelectorAll('a')
    const hrefs = Array.from(links).map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/pool')
    expect(hrefs).toContain('/bridge')
  })

  it('has Lend and Stable as navigable links', () => {
    render(<Header />)
    const allLinks = document.querySelectorAll('a')
    const hrefs = Array.from(allLinks).map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/lend')
    expect(hrefs).toContain('/stable')
  })

  it('has Lend and Stable in mobile menu', () => {
    render(<Header />)
    fireEvent.click(screen.getByLabelText('Open menu'))
    const mobileNav = screen.getByTestId('mobile-nav')
    expect(mobileNav.textContent).toContain('Lend')
    expect(mobileNav.textContent).toContain('Stable')
  })
})
