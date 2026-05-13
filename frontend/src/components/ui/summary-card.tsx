import { cn } from '@/lib/cn'

interface SummaryCardProps {
  label: string
  value: string
  color?: string
  className?: string
}

export function SummaryCard({ label, value, color, className }: SummaryCardProps) {
  return (
    <div className={cn(
      "bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5",
      className
    )}>
      <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">{label}</div>
      <div className={cn(
        "text-lg sm:text-xl font-bold",
        color ?? 'text-white'
      )}>
        {value}
      </div>
    </div>
  )
}