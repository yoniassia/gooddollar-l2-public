import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Live Activity',
  description: 'Real-time on-chain activity on GoodDollar L2 — live transactions, block data, and protocol events.',
}

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
