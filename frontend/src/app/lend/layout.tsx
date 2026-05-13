import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lending & Borrowing',
  description: 'Supply and borrow assets on GoodDollar L2. Earn yield while every interest spread funds UBI.',
}

export default function LendLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
