import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'UBI Impact Dashboard',
  description: 'Track how every protocol fee on GoodDollar L2 funds universal basic income. Real-time revenue breakdown.',
}

export default function UBIImpactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
