import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SwapConfirmModal } from '../SwapConfirmModal'

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  inputAmount: '10',
  outputAmount: '997,000',
  inputSymbol: 'ETH',
  outputSymbol: 'G$',
  inputUsd: '~$30,000',
  outputUsd: '~$9,970',
  exchangeRate: '1 ETH = 100,000 G$',
  priceImpact: 0.45,
  minimumReceived: '992,015 G$',
  networkFee: '< $0.01',
  ubiFee: '999.9 G$',
}

describe('SwapConfirmModal', () => {
  it('renders when open', () => {
    render(<SwapConfirmModal {...defaultProps} />)
    expect(screen.getByText('Review Swap')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<SwapConfirmModal {...defaultProps} open={false} />)
    expect(screen.queryByText('Review Swap')).not.toBeInTheDocument()
  })

  it('shows input and output amounts with tokens', () => {
    render(<SwapConfirmModal {...defaultProps} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('997,000')).toBeInTheDocument()
    expect(screen.getAllByText('G$').length).toBeGreaterThanOrEqual(1)
  })

  it('shows USD equivalents', () => {
    render(<SwapConfirmModal {...defaultProps} />)
    expect(screen.getByText('~$30,000')).toBeInTheDocument()
    expect(screen.getByText('~$9,970')).toBeInTheDocument()
  })

  it('shows exchange rate', () => {
    render(<SwapConfirmModal {...defaultProps} />)
    expect(screen.getByText('1 ETH = 100,000 G$')).toBeInTheDocument()
  })

  it('shows swap details', () => {
    render(<SwapConfirmModal {...defaultProps} />)
    expect(screen.getByText('0.45%')).toBeInTheDocument()
    expect(screen.getByText('992,015 G$')).toBeInTheDocument()
    expect(screen.getByText('< $0.01')).toBeInTheDocument()
  })

  it('shows UBI contribution', () => {
    render(<SwapConfirmModal {...defaultProps} />)
    expect(screen.getByText(/999\.9 G\$/)).toBeInTheDocument()
  })

  it('calls onConfirm when Confirm Swap is clicked', () => {
    const onConfirm = vi.fn()
    render(<SwapConfirmModal {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm swap/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<SwapConfirmModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<SwapConfirmModal {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<SwapConfirmModal {...defaultProps} onClose={onClose} />)
    fireEvent.mouseDown(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
