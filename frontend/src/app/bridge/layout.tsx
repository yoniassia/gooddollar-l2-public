import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Bridge',
  description: 'Bridge assets to and from GoodDollar L2. Fast withdrawals and multi-chain support via Li.Fi.',
}

export default function BridgeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
