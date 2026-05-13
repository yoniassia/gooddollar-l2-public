import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Explore Tokens',
  description: 'Explore token prices and market data on GoodDollar L2. Real-time CoinGecko price feeds.',
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
