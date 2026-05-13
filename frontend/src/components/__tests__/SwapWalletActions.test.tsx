import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SwapWalletActions } from '../SwapWalletActions'
import { TestWrapper } from '@/test-utils/wrapper'

vi.mock('../SwapConfirmModal', () => ({
  SwapConfirmModal: () => null,
}))

const baseToken = { symbol: 'ETH', name: 'Ether', icon: '', decimals: 18, address: '0x0', category: 'Infrastructure' as const }
const outputToken = { symbol: 'G$', name: 'GoodDollar', icon: '', decimals: 18, address: '0x1', category: 'GoodDollar' as const }

describe('SwapWalletActions hint text', () => {
  it('shows hint text when hasAmount is false', () => {
    render(
      <TestWrapper>
        <SwapWalletActions
          variant="swap-button"
          inputToken={baseToken}
          outputToken={outputToken}
          inputAmount=""
          hasAmount={false}
        />
      </TestWrapper>
    )
    expect(screen.getByText(/fees fund basic income/i)).toBeInTheDocument()
  })

  it('hides hint text when hasAmount is true', () => {
    render(
      <TestWrapper>
        <SwapWalletActions
          variant="swap-button"
          inputToken={baseToken}
          outputToken={outputToken}
          inputAmount="1"
          hasAmount={true}
        />
      </TestWrapper>
    )
    expect(screen.queryByText(/fees fund basic income/i)).not.toBeInTheDocument()
  })
})
