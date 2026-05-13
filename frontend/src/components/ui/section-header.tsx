import Link from 'next/link'
import { cn } from '@/lib/cn'

interface SectionHeaderProps {
  title: string
  href: string
  icon: React.ReactNode
  linkText?: string
  className?: string
}

export function SectionHeader({
  title,
  href,
  icon,
  linkText = "View All →",
  className
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-3", className)}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-goodgreen/10 border border-goodgreen/15 flex items-center justify-center text-goodgreen">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <Link
        href={href}
        className="text-xs text-goodgreen hover:text-goodgreen/80 transition-colors"
      >
        {linkText}
      </Link>
    </div>
  )
}