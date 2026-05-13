import type { Metadata } from 'next'
import { StocksSectionNav } from './StocksSectionNav'

export const metadata: Metadata = {
  title: 'Synthetic Stocks',
  description: 'Trade tokenized equities on GoodDollar L2. Synthetic stocks backed by real price feeds — every fee funds UBI.',
}

export default function StocksLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StocksSectionNav />
      {children}
    </>
  )
}
