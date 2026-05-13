import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UBIExplainer } from '@/components/UBIExplainer'

describe('UBIExplainer', () => {
  it('renders the section heading', () => {
    render(<UBIExplainer />)
    expect(screen.getByText('Your Fees, Their Income')).toBeInTheDocument()
  })

  it('mentions UBI definition', () => {
    render(<UBIExplainer />)
    expect(screen.getByText(/Universal Basic Income/)).toBeInTheDocument()
  })

  it('shows the 640K+ beneficiary stat', () => {
    render(<UBIExplainer />)
    expect(screen.getByText('640,000+ people')).toBeInTheDocument()
  })

  it('renders all 4 flow steps', () => {
    render(<UBIExplainer />)
    expect(screen.getByText('Your Trade')).toBeInTheDocument()
    expect(screen.getByText('33% Fee')).toBeInTheDocument()
    expect(screen.getByText('UBI Pool')).toBeInTheDocument()
    expect(screen.getByText('640K+ People')).toBeInTheDocument()
  })
})
