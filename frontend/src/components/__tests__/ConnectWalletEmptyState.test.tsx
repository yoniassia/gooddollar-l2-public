import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConnectWalletEmptyState } from '../ConnectWalletEmptyState'

describe('ConnectWalletEmptyState', () => {
  it('renders children in demo mode', () => {
    render(
      <ConnectWalletEmptyState>
        <div>Portfolio Content</div>
      </ConnectWalletEmptyState>
    )
    expect(screen.getByText('Portfolio Content')).toBeInTheDocument()
  })

  it('renders children with custom title/description props (unused in demo)', () => {
    render(
      <ConnectWalletEmptyState title="Custom Title" description="Custom desc">
        <div>Content</div>
      </ConnectWalletEmptyState>
    )
    expect(screen.getByText('Content')).toBeInTheDocument()
  })
})
