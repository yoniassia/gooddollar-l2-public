import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InfoBanner } from '../InfoBanner'

const mockStorage: Record<string, string> = {}

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => mockStorage[k] ?? null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { mockStorage[k] = v })
})

describe('InfoBanner', () => {
  it('renders title and description after mount when not dismissed', async () => {
    render(<InfoBanner title="Test Title" description="Test desc" storageKey="test-key" />)
    expect(await screen.findByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test desc')).toBeInTheDocument()
  })

  it('does not render when already dismissed in localStorage', () => {
    mockStorage['test-key'] = 'true'
    render(<InfoBanner title="Test Title" description="Test desc" storageKey="test-key" />)
    expect(screen.queryByText('Test Title')).not.toBeInTheDocument()
  })

  it('dismisses and persists to localStorage when close is clicked', async () => {
    render(<InfoBanner title="Test Title" description="Test desc" storageKey="test-key" />)
    const btn = await screen.findByLabelText('Dismiss')
    fireEvent.click(btn)
    expect(screen.queryByText('Test Title')).not.toBeInTheDocument()
    expect(mockStorage['test-key']).toBe('true')
  })
})
