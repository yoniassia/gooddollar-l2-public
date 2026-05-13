/**
 * Test wrapper providing WagmiProvider + QueryClientProvider for component tests.
 */
import React from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { gooddollarL2 } from '@/lib/chain'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const testConfig = createConfig({
  chains: [gooddollarL2],
  transports: { [gooddollarL2.id]: http() },
  ssr: true,
})

export function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={testConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
