'use client'

import { SectionNav } from '@/components/SectionNav'

const TABS = [
  { label: 'Markets', href: '/stocks', match: (p: string) => p.startsWith('/stocks') && p !== '/stocks/portfolio' },
  { label: 'Portfolio', href: '/stocks/portfolio', match: (p: string) => p === '/stocks/portfolio' },
]

export function StocksSectionNav() {
  return <SectionNav tabs={TABS} />
}
