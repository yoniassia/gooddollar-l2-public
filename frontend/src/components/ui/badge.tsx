import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-goodgreen/15 text-goodgreen border border-goodgreen/20',
        secondary:
          'bg-muted text-muted-foreground border border-border',
        outline:
          'border border-border text-foreground',
        destructive:
          'bg-red-500/10 text-red-400 border border-red-500/20',
        warning:
          'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
        success:
          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
