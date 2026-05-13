import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Yield Vaults',
  description: 'Auto-compounding ERC-4626 vaults on GoodDollar L2. Earn optimized yield — performance fees fund UBI.',
}

export default function YieldLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
