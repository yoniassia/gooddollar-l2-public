import { memo, useMemo } from 'react'
import { TOKEN_COLORS } from '@/lib/tokens'

interface TokenIconProps {
  symbol: string
  size?: number
  className?: string
}

function GoodDollarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#00B0A0" />
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontWeight="700"
        fontSize="13"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        G$
      </text>
    </svg>
  )
}

function EthIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="#fff" fillOpacity=".6" />
      <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="#fff" />
      <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="#fff" fillOpacity=".6" />
      <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.379z" fill="#fff" />
      <path d="M16.498 20.573l7.497-4.353-7.497-3.348v7.701z" fill="#fff" fillOpacity=".2" />
      <path d="M9 16.22l7.498 4.353v-7.701L9 16.22z" fill="#fff" fillOpacity=".6" />
    </svg>
  )
}

function UsdcIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.4 18.2c0-2.1-1.3-2.8-3.8-3.1-1.8-.3-2.2-.7-2.2-1.5s.6-1.3 1.8-1.3c1.1 0 1.6.4 1.9 1.2.1.1.2.2.3.2h.7c.2 0 .3-.1.3-.3v-.1c-.3-1.1-1.1-1.9-2.3-2.1v-1.3c0-.2-.1-.3-.3-.3h-.6c-.2 0-.3.1-.3.3v1.2c-1.6.2-2.6 1.2-2.6 2.5 0 2 1.2 2.7 3.7 3 1.7.3 2.3.6 2.3 1.6 0 1-.8 1.6-2 1.6-1.5 0-2.1-.6-2.3-1.5 0-.1-.2-.2-.3-.2h-.8c-.2 0-.3.1-.3.3v.1c.3 1.3 1.2 2.1 2.8 2.4v1.3c0 .2.1.3.3.3h.6c.2 0 .3-.1.3-.3v-1.3c1.7-.3 2.8-1.3 2.8-2.7z"
        fill="#fff"
      />
      <path
        d="M13.1 25.1c-4.2-1.5-6.3-6.1-4.8-10.2 .8-2.2 2.6-3.9 4.8-4.7.2-.1.3-.2.3-.4V9.1c0-.2-.1-.3-.3-.3-.1 0-.1 0-.2 0C8.2 10.5 5.7 15.6 7.4 20.3c1 2.8 3.2 5 6 6 .2.1.4 0 .4-.2v-.7c.1-.2 0-.3-.2-.4l-.5.1zM19.1 8.8c-.2-.1-.4 0-.4.2v.7c0 .2.1.3.3.4 4.2 1.5 6.3 6.1 4.8 10.2-.8 2.2-2.6 3.9-4.8 4.7-.2.1-.3.2-.3.4v.7c0 .2.1.3.3.3.1 0 .1 0 .2 0 4.7-1.7 7.2-6.8 5.5-11.5-1-2.8-3.2-5-6-6l.4 0z"
        fill="#fff"
      />
    </svg>
  )
}

function WbtcIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path d="M21.8 13.8c.3-1.8-1.1-2.8-3-3.4l.6-2.5-1.5-.4-.6 2.4c-.4-.1-.8-.2-1.2-.3l.6-2.4-1.5-.4-.6 2.5c-.3-.1-.6-.2-1-.2l-2-.5-.4 1.6s1.1.3 1.1.3c.6.2.7.6.7 1l-.7 2.8c0 0 .1 0 .1 0l-.1 0-1 4c-.1.2-.3.5-.7.4 0 0-1.1-.3-1.1-.3l-.8 1.7 1.9.5c.4.1.7.2 1 .3l-.6 2.5 1.5.4.6-2.5c.4.1.8.2 1.2.3l-.6 2.5 1.5.4.6-2.5c2.6.5 4.5.3 5.3-2 .7-1.9 0-2.9-1.4-3.6 1-.2 1.7-1 2-2.4zm-3.5 4.9c-.5 2-3.8.9-4.9.6l.9-3.5c1.1.3 4.5.8 4 2.9zm.5-5c-.4 1.8-3.2.9-4.1.7l.8-3.2c.9.2 3.8.7 3.3 2.5z" fill="#fff"/>
    </svg>
  )
}

function DaiIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#F5AC37" />
      <path d="M16 6l8.5 10L16 26 7.5 16 16 6z" fill="#fff" fillOpacity=".9" />
      <path d="M16 6L7.5 16 16 20.5 24.5 16 16 6z" fill="#fff" fillOpacity=".6" />
    </svg>
  )
}

function UsdtIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path d="M17.9 17.1v-.1c-.1 0-.7-.1-2-.1-1 0-1.7 0-1.9.1v.1c-3.4.2-5.9.8-5.9 1.5s2.5 1.4 5.9 1.5v5h3.8v-5c3.4-.2 5.9-.8 5.9-1.5s-2.5-1.4-5.8-1.5zm-2 2.6c-4.1 0-7.3-.7-7.3-1.1 0-.5 3.2-1.1 7.3-1.1s7.3.7 7.3 1.1c0 .4-3.3 1.1-7.3 1.1z" fill="#fff"/>
      <path d="M17.9 14.6V11h4.5V7.8H9.5V11h4.5v3.6c-4 .2-7 1-7 1.9s3 1.7 7 1.9v6.5h3.9v-6.5c4-.2 7-1 7-1.9s-3-1.7-6.9-1.9z" fill="#fff"/>
    </svg>
  )
}

function LinkIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#2A5ADA" />
      <path d="M16 6l-2.5 1.4-6 3.5L5 12.3v7.4l2.5 1.4 6 3.5L16 26l2.5-1.4 6-3.5 2.5-1.4v-7.4l-2.5-1.4-6-3.5L16 6zm4.5 14.5l-4.5 2.6-4.5-2.6v-5.2L16 12.7l4.5 2.6v5.2z" fill="#fff"/>
    </svg>
  )
}

function UniIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#FF007A" />
      <text x="16" y="17" textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="700" fontSize="11" fontFamily="system-ui, -apple-system, sans-serif">UNI</text>
    </svg>
  )
}

function GenericTokenIcon({ symbol, size }: { symbol: string; size: number }) {
  const color = TOKEN_COLORS[symbol] || '#6B7280'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill={color} />
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontWeight="700"
        fontSize={symbol.length > 3 ? '9' : '11'}
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {symbol.length > 4 ? symbol.slice(0, 3) : symbol}
      </text>
    </svg>
  )
}

const ICON_COMPONENTS: Record<string, (props: { size: number }) => JSX.Element> = {
  'G$': GoodDollarIcon,
  'ETH': EthIcon,
  'WETH': EthIcon,
  'USDC': UsdcIcon,
  'WBTC': WbtcIcon,
  'DAI': DaiIcon,
  'USDT': UsdtIcon,
  'LINK': LinkIcon,
  'UNI': UniIcon,
}

export const TokenIcon = memo(function TokenIcon({ symbol, size = 20, className }: TokenIconProps) {
  const icon = useMemo(() => {
    const Component = ICON_COMPONENTS[symbol]
    return Component ? <Component size={size} /> : <GenericTokenIcon symbol={symbol} size={size} />
  }, [symbol, size])

  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className ?? ''}`}>
      {icon}
    </span>
  )
})
