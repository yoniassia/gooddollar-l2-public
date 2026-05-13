'use client'

import { Check, X } from 'lucide-react'
import { DEVNET_EXPLORER_URL } from '../lib/devnet'

interface TxStatusProps {
  hash?: string
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  error?: string
  onClose: () => void
}

export function TxStatus({ hash, isPending, isSuccess, isError, error, onClose }: TxStatusProps) {
  if (!isPending && !isSuccess && !isError) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-dark-100 border border-gray-700/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        {isPending && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-goodgreen/30 border-t-goodgreen animate-spin" />
            <h3 className="text-lg font-semibold text-white mb-2">Transaction Pending</h3>
            <p className="text-sm text-gray-400">Waiting for confirmation...</p>
            {hash && (
              <p className="text-xs text-gray-500 mt-2 font-mono break-all">
                {hash.slice(0, 10)}...{hash.slice(-8)}
              </p>
            )}
          </div>
        )}

        {isSuccess && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-goodgreen/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-goodgreen" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Swap Successful!</h3>
            <p className="text-sm text-goodgreen mb-3">Your swap was completed and UBI was funded.</p>
            {hash && (
              <a
                href={`${DEVNET_EXPLORER_URL}/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-goodgreen/70 hover:text-goodgreen underline"
              >
                View on Explorer
              </a>
            )}
          </div>
        )}

        {isError && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <X className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Transaction Failed</h3>
            <p className="text-sm text-red-400 mb-1">{error || 'Something went wrong'}</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-xl bg-dark-50 text-white font-medium hover:bg-dark-50/80 transition-colors"
        >
          {isSuccess ? 'Done' : isError ? 'Try Again' : 'Close'}
        </button>
      </div>
    </div>
  )
}
