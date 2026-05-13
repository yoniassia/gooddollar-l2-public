import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Market',
  description: 'Create a prediction market with a question, resolution criteria, and initial liquidity.',
}

export default function CreateMarketLayout({ children }: { children: React.ReactNode }) {
  return children
}
