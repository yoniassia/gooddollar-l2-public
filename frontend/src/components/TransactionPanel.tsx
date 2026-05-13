'use client'

import { useTransactionContext } from '@/lib/TransactionContext'
import { useWalletReady } from '@/lib/WalletReadyContext'
import { TokenIcon } from './TokenIcon'
import type { Transaction } from '@/lib/useTransactions'

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatusIcon({ status }: { status: Transaction['status'] }) {
  if (status === 'pending') {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-goodgreen border-t-transparent animate-spin" />
    )
  }
  if (status === 'confirmed') {
    return (
      <div className="w-5 h-5 rounded-full bg-goodgreen/20 flex items-center justify-center">
        <svg className="w-3 h-3 text-goodgreen" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    )
  }
  return (
    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  )
}

function TransactionRow({ tx }: { tx: Transaction }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-dark-50/40 transition-colors">
      <div className="flex items-center -space-x-1.5">
        <TokenIcon symbol={tx.inputSymbol} size={20} />
        <TokenIcon symbol={tx.outputSymbol} size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">
          Swap {tx.inputAmount} {tx.inputSymbol} for {tx.outputAmount} {tx.outputSymbol}
        </p>
        <p className="text-xs text-gray-500">{relativeTime(tx.timestamp)}</p>
      </div>
      <StatusIcon status={tx.status} />
    </div>
  )
}

interface TransactionPanelProps {
  onClose: () => void
}

function EmptyStateDisconnected() {
  return (
    <div className="py-8 px-4 text-center">
      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-goodgreen/10 flex items-center justify-center">
        <svg className="w-5 h-5 text-goodgreen" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      </div>
      <p className="text-sm font-medium text-white mb-1">Connect your wallet</p>
      <p className="text-xs text-gray-500">Your swap history and pending transactions will appear here</p>
    </div>
  )
}

function EmptyStateConnected({ onClose }: { onClose: () => void }) {
  return (
    <div className="py-8 px-4 text-center">
      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-goodgreen/10 flex items-center justify-center">
        <svg className="w-5 h-5 text-goodgreen" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-white mb-1">No swaps yet</p>
      <p className="text-xs text-gray-500 mb-3">Complete your first swap and it&apos;ll show up here</p>
      <button
        onClick={onClose}
        className="px-4 py-1.5 text-xs font-medium rounded-lg bg-goodgreen/10 text-goodgreen hover:bg-goodgreen/20 transition-colors"
      >
        Start Swapping
      </button>
    </div>
  )
}

export function TransactionPanel({ onClose }: TransactionPanelProps) {
  const { transactions, clearAll } = useTransactionContext()
  const walletReady = useWalletReady()

  return (
    <div
      data-testid="transaction-panel"
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-dark-100 border border-gray-700/40 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/20">
        <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
        {transactions.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {transactions.length === 0 ? (
          walletReady ? (
            <EmptyStateConnected onClose={onClose} />
          ) : (
            <EmptyStateDisconnected />
          )
        ) : (
          transactions.map(tx => <TransactionRow key={tx.id} tx={tx} />)
        )}
      </div>
    </div>
  )
}
