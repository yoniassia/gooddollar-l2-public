import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'gUSD Stablecoin',
  description: 'Mint gUSD stablecoin by depositing collateral on GoodDollar L2. Stability fees fund UBI.',
}

export default function StableLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
