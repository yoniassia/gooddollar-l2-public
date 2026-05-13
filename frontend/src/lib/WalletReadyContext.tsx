'use client'

import { createContext, useContext } from 'react'

export const WalletReadyContext = createContext(false)

export function useWalletReady() {
  return useContext(WalletReadyContext)
}
