'use client'

import { type Token } from '@/lib/tokens'
import { TokenIcon } from './TokenIcon'
import { formatAmount } from '@/lib/format'

interface UBIBreakdownProps {
  ubiFeeAmount: number
  outputToken: Token
  visible: boolean
}

export function UBIBreakdown({ ubiFeeAmount, outputToken, visible }: UBIBreakdownProps) {
  if (!visible || ubiFeeAmount <= 0) return null

  const formatted = formatAmount(ubiFeeAmount)

  return (
    <div className="mx-4 mt-3 p-3 rounded-xl bg-goodgreen/5 border border-goodgreen/20">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-goodgreen/20 flex items-center justify-center">
          <TokenIcon symbol="G$" size={16} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-goodgreen">
            {formatted} {outputToken.symbol} funds UBI
          </p>
          <p className="text-xs text-goodgreen/60 mt-0.5">
            33.33% of the swap fee goes directly to the GoodDollar UBI pool
          </p>
        </div>
      </div>
    </div>
  )
}
