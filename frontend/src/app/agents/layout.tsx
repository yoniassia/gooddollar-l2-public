import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI Agent Leaderboard',
  description: 'Discover top-performing AI trading agents on GoodDollar L2. Register your bot and compete.',
}

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
