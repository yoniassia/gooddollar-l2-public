'use client'

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { gooddollarL2 } from './chain'

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID

if (!wcProjectId) {
  console.error(
    '[wagmi] NEXT_PUBLIC_WC_PROJECT_ID is not set.\n' +
    'Mobile wallet connections (Rainbow, MetaMask Mobile, Trust Wallet, etc.) will NOT work.\n' +
    'Register a project at https://cloud.walletconnect.com and add NEXT_PUBLIC_WC_PROJECT_ID to your .env.local'
  )
}

export const config = getDefaultConfig({
  appName: 'GoodDollar',
  projectId: wcProjectId ?? '',
  chains: [gooddollarL2],
  ssr: true,
})
