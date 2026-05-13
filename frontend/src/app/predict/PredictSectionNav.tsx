'use client'

import { SectionNav } from '@/components/SectionNav'

const TABS = [
  { label: 'Markets', href: '/predict', match: (p: string) => p.startsWith('/predict') && p !== '/predict/portfolio' && p !== '/predict/create' },
  { label: 'Portfolio', href: '/predict/portfolio', match: (p: string) => p === '/predict/portfolio' },
  { label: 'Create Market', href: '/predict/create', match: (p: string) => p === '/predict/create' },
]

export function PredictSectionNav() {
  return <SectionNav tabs={TABS} />
}
