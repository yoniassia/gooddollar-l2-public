import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChartErrorBoundary } from '../ChartErrorBoundary'

function SafeChild() {
  return <div>Chart content</div>
}

function AlwaysThrows(): React.ReactElement {
  throw new Error('chart failed')
}

describe('ChartErrorBoundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when no error', () => {
    render(
      <ChartErrorBoundary>
        <SafeChild />
      </ChartErrorBoundary>
    )
    expect(screen.getByText('Chart content')).toBeInTheDocument()
  })

  it('renders error fallback when children throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ChartErrorBoundary>
        <AlwaysThrows />
      </ChartErrorBoundary>
    )

    expect(screen.getByText('Chart unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('retry resets the error state and remounts children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { rerender } = render(
      <ChartErrorBoundary>
        <AlwaysThrows />
      </ChartErrorBoundary>
    )

    expect(screen.getByText('Chart unavailable')).toBeInTheDocument()

    // Simulate a fixed chart module: same boundary instance, new child tree — still shows
    // fallback until Retry clears `hasError`.
    rerender(
      <ChartErrorBoundary>
        <SafeChild />
      </ChartErrorBoundary>
    )

    expect(screen.getByText('Chart unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(screen.queryByText('Chart unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('Chart content')).toBeInTheDocument()
  })
})
