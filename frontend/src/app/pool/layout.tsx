import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Liquidity Pools',
  description: 'Provide liquidity on GoodDollar L2 DEX pools. Earn trading fees while funding UBI.',
}

export default function PoolLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
