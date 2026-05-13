import { cn } from '@/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'

const riskIndicatorVariants = cva(
  'inline-flex items-center gap-1.5 text-xs font-medium',
  {
    variants: {
      variant: {
        safe: 'text-green-400',
        warning: 'text-yellow-400',
        danger: 'text-red-400',
        neutral: 'text-gray-400'
      },
      size: {
        sm: 'text-xs',
        default: 'text-xs',
        lg: 'text-sm'
      }
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default'
    }
  }
)

const dotVariants = cva(
  'rounded-full flex-shrink-0',
  {
    variants: {
      variant: {
        safe: 'bg-green-400',
        warning: 'bg-yellow-400',
        danger: 'bg-red-400',
        neutral: 'bg-gray-400'
      },
      size: {
        sm: 'w-1.5 h-1.5',
        default: 'w-2 h-2',
        lg: 'w-2.5 h-2.5'
      },
      animated: {
        true: 'animate-pulse',
        false: ''
      }
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default',
      animated: false
    }
  }
)

export interface RiskIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof riskIndicatorVariants> {
  label?: string
  value?: string | number
  animated?: boolean
  dotOnly?: boolean
}

function RiskIndicator({
  className,
  variant,
  size,
  label,
  value,
  animated = false,
  dotOnly = false,
  ...props
}: RiskIndicatorProps) {
  if (dotOnly) {
    return (
      <div
        className={cn(dotVariants({ variant, size, animated }), className)}
        title={label}
        {...props}
      />
    )
  }

  return (
    <div className={cn(riskIndicatorVariants({ variant, size }), className)} {...props}>
      <div className={cn(dotVariants({ variant, size, animated }))} />
      {label && <span>{label}</span>}
      {value && <span className="font-semibold">{value}</span>}
    </div>
  )
}

// Helper functions for common DeFi risk calculations
export function getHealthFactorRisk(healthFactor: number): VariantProps<typeof riskIndicatorVariants>['variant'] {
  if (healthFactor >= 2) return 'safe'
  if (healthFactor >= 1.2) return 'warning'
  return 'danger'
}

export function getLiquidationRisk(
  currentPrice: number,
  liquidationPrice: number
): VariantProps<typeof riskIndicatorVariants>['variant'] {
  const distance = Math.abs(currentPrice - liquidationPrice) / currentPrice
  if (distance >= 0.2) return 'safe' // >20% away
  if (distance >= 0.1) return 'warning' // >10% away
  return 'danger' // <10% away
}

export function getPositionPnLRisk(pnlPercentage: number): VariantProps<typeof riskIndicatorVariants>['variant'] {
  if (pnlPercentage >= 0) return 'safe'
  if (pnlPercentage >= -10) return 'warning'
  return 'danger'
}

export { RiskIndicator, riskIndicatorVariants, dotVariants }