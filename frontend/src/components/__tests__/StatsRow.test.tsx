import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsRow } from '../StatsRow'

describe('StatsRow', () => {
  it('renders three stat cards', () => {
    render(<StatsRow />)
    expect(screen.getByText('UBI Distributed')).toBeInTheDocument()
    expect(screen.getByText('Daily Claimers')).toBeInTheDocument()
    expect(screen.getByText('Total Swaps')).toBeInTheDocument()
  })

  it('renders stat values', () => {
    render(<StatsRow />)
    expect(screen.getByText('$2.4M')).toBeInTheDocument()
    expect(screen.getByText('640K+')).toBeInTheDocument()
    expect(screen.getByText('1.2M')).toBeInTheDocument()
  })
})
