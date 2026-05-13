import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorks } from '../HowItWorks'

describe('HowItWorks', () => {
  it('renders three steps', () => {
    render(<HowItWorks />)
    expect(screen.getByText('How It Works')).toBeInTheDocument()
    expect(screen.getByText('Trade Any Asset')).toBeInTheDocument()
    expect(screen.getByText('Fees Fund UBI')).toBeInTheDocument()
    expect(screen.getByText('People Earn Income')).toBeInTheDocument()
  })

  it('renders step descriptions', () => {
    render(<HowItWorks />)
    expect(screen.getByText(/Swap tokens, trade stocks/i)).toBeInTheDocument()
    expect(screen.getByText(/33% of every trading fee/i)).toBeInTheDocument()
    expect(screen.getByText(/verified humans worldwide/i)).toBeInTheDocument()
  })

  it('renders step numbers', () => {
    render(<HowItWorks />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
