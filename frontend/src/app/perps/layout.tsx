import type { Metadata } from 'next'
import { PerpsSectionNav } from './PerpsSectionNav'

export const metadata: Metadata = {
  title: 'Perpetual Futures',
  description: 'Trade perpetual futures on GoodDollar L2. Long or short any asset with leverage — every fee funds UBI.',
}

export default function PerpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PerpsSectionNav />
      {children}
    </>
  )
}
