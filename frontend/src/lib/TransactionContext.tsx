'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useTransactions, type Transaction, type TxStatus } from './useTransactions'

interface TransactionContextValue {
  transactions: Transaction[]
  addTransaction: (tx: Omit<Transaction, 'id' | 'timestamp'>) => string
  updateStatus: (id: string, status: TxStatus) => void
  clearAll: () => void
  pendingCount: number
}

const TransactionContext = createContext<TransactionContextValue | null>(null)

export function TransactionProvider({ children }: { children: ReactNode }) {
  const value = useTransactions()
  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  )
}

export function useTransactionContext() {
  const ctx = useContext(TransactionContext)
  if (!ctx) throw new Error('useTransactionContext must be used inside TransactionProvider')
  return ctx
}
