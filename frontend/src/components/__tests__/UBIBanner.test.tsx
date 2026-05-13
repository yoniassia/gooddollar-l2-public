import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UBIBanner } from '../UBIBanner'

const mockStorage: Record<string, string> = {}

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => mockStorage[k] ?? null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { mockStorage[k] = v })
})

describe('UBIBanner', () => {
  it('renders UBI stats after mount when not dismissed', async () => {
    render(<UBIBanner />)
    expect(await screen.findByText(/distributed to/)).toBeInTheDocument()
    expect(screen.getByText('$2.4M')).toBeInTheDocument()
    expect(screen.getByText('640K+')).toBeInTheDocument()
  })

  it('does not render when already dismissed in localStorage', () => {
    mockStorage['ubi-banner-dismissed'] = 'true'
    render(<UBIBanner />)
    expect(screen.queryByText(/distributed to/)).not.toBeInTheDocument()
  })

  it('dismisses and persists to localStorage when close is clicked', async () => {
    render(<UBIBanner />)
    const btn = await screen.findByLabelText('Dismiss UBI banner')
    fireEvent.click(btn)
    expect(screen.queryByText(/distributed to/)).not.toBeInTheDocument()
    expect(mockStorage['ubi-banner-dismissed']).toBe('true')
  })
})
