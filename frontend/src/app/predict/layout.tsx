import type { Metadata } from 'next'
import { PredictSectionNav } from './PredictSectionNav'

export const metadata: Metadata = {
  title: 'Prediction Markets',
  description: 'Bet on outcomes with GoodDollar prediction markets. Every trade funds universal basic income.',
}

export default function PredictLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PredictSectionNav />
      {children}
    </>
  )
}
