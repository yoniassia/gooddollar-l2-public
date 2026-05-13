'use client'

import { useState, useEffect, useCallback } from 'react'

export type TxStatus = 'pending' | 'confirmed' | 'failed'

export interface Transaction {
  id: string
  inputSymbol: string
  outputSymbol: string
  inputAmount: string
  outputAmount: string
  status: TxStatus
  timestamp: number
  hash?: string
}

const STORAGE_KEY = 'goodswap-transactions'
const MAX_TRANSACTIONS = 20

function loadTransactions(): Transaction[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveTransactions(txs: Transaction[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs.slice(0, MAX_TRANSACTIONS)))
  } catch { /* quota exceeded — silently ignore */ }
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    setTransactions(loadTransactions())
  }, [])

  const addTransaction = useCallback((tx: Omit<Transaction, 'id' | 'timestamp'>) => {
    const newTx: Transaction = {
      ...tx,
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    }
    setTransactions(prev => {
      const next = [newTx, ...prev].slice(0, MAX_TRANSACTIONS)
      saveTransactions(next)
      return next
    })
    return newTx.id
  }, [])

  const updateStatus = useCallback((id: string, status: TxStatus) => {
    setTransactions(prev => {
      const next = prev.map(tx => tx.id === id ? { ...tx, status } : tx)
      saveTransactions(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setTransactions([])
    saveTransactions([])
  }, [])

  const pendingCount = transactions.filter(tx => tx.status === 'pending').length

  return { transactions, addTransaction, updateStatus, clearAll, pendingCount }
}
