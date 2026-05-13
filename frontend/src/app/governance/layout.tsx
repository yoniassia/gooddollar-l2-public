import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Governance',
  description: 'GoodDAO governance — lock G$ for veG$, propose, vote, and shape the future of GoodDollar.',
}

export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
