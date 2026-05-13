import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactionPanel } from '../TransactionPanel'

let mockWalletReady = false
vi.mock('@/lib/WalletReadyContext', () => ({
  useWalletReady: () => mockWalletReady,
}))

let mockTransactions: unknown[] = []
vi.mock('@/lib/TransactionContext', () => ({
  useTransactionContext: () => ({
    transactions: mockTransactions,
    clearAll: vi.fn(),
  }),
}))

vi.mock('../TokenIcon', () => ({
  TokenIcon: ({ symbol }: { symbol: string }) => <span>{symbol}</span>,
}))

describe('TransactionPanel empty state', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    mockTransactions = []
    mockWalletReady = false
  })

  it('shows wallet connect prompt when wallet not ready and no transactions', () => {
    mockWalletReady = false
    render(<TransactionPanel onClose={onClose} />)

    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument()
    expect(screen.getByText(/swap history/i)).toBeInTheDocument()
  })

  it('shows "no swaps yet" when wallet is ready but no transactions', () => {
    mockWalletReady = true
    render(<TransactionPanel onClose={onClose} />)

    expect(screen.getByText(/no swaps yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start swapping/i })).toBeInTheDocument()
  })

  it('"Start Swapping" button calls onClose', () => {
    mockWalletReady = true
    render(<TransactionPanel onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /start swapping/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows transaction list when transactions exist', () => {
    mockWalletReady = true
    mockTransactions = [
      {
        id: '1',
        inputSymbol: 'ETH',
        outputSymbol: 'G$',
        inputAmount: '1',
        outputAmount: '300000',
        status: 'confirmed',
        timestamp: Date.now() - 60000,
      },
    ]
    render(<TransactionPanel onClose={onClose} />)

    expect(screen.getByText(/Swap 1 ETH for 300000 G\$/)).toBeInTheDocument()
    expect(screen.queryByText(/no swaps yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/connect your wallet/i)).not.toBeInTheDocument()
  })
})
