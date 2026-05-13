'use client'

import { useState, useMemo, memo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, PanInfo } from 'framer-motion'
import { TokenIcon } from '@/components/TokenIcon'
import { Sparkline } from '@/components/Sparkline'
import { PercentageChange } from '@/components/ui/percentage-change'
import { formatPrice, formatVolume, formatMarketCap, type TokenMarketData } from '@/lib/marketData'
import { TOKEN_CATEGORIES, type TokenCategory } from '@/lib/tokens'
import { useOnChainMarketData } from '@/lib/useOnChainMarketData'

type SortField = 'price' | 'change1h' | 'change24h' | 'change7d' | 'volume24h' | 'marketCap'
type SortDir = 'asc' | 'desc'

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-gray-600 ml-1">&#8597;</span>
  return <span className="text-goodgreen ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

interface TokenRowProps {
  token: TokenMarketData
  idx: number
  onRowClick: (symbol: string) => void
  onSwapClick: (symbol: string) => void
}

const TokenRow = memo(function TokenRow({ token, idx, onRowClick, onSwapClick }: TokenRowProps) {
  return (
    <tr
      onClick={() => onRowClick(token.symbol)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(token.symbol) } }}
      tabIndex={0}
      className={`group border-b border-gray-700/10 hover:bg-white/[0.04] hover:-translate-y-[1px] cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-goodgreen/40 ${idx % 2 === 1 ? 'bg-dark-50/15' : ''}`}
    >
      <td className="py-3 px-3 text-gray-500 text-right">{idx + 1}</td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-2.5">
          <TokenIcon symbol={token.symbol} size={28} />
          <div>
            <span className="font-semibold text-white">{token.symbol}</span>
            <span className="text-gray-500 ml-1.5 hidden sm:inline text-xs">{token.name}</span>
          </div>
        </div>
      </td>
      <td className="py-3 px-3 text-right text-white font-medium">
        {formatPrice(token.price)}
      </td>
      <td className="py-3 px-2 text-right font-medium hidden lg:table-cell">
        <PercentageChange value={token.change1h} decimals={1} size="xs" />
      </td>
      <td className="py-3 px-3 text-right font-medium">
        <PercentageChange value={token.change24h} decimals={2} size="sm" />
      </td>
      <td className="py-3 px-2 text-right font-medium hidden lg:table-cell">
        <PercentageChange value={token.change7d} decimals={1} size="xs" />
      </td>
      <td className="py-3 px-3 text-right text-gray-300 hidden sm:table-cell">
        {formatVolume(token.volume24h)}
      </td>
      <td className="py-3 px-3 text-right text-gray-300 hidden md:table-cell">
        {formatMarketCap(token.marketCap)}
      </td>
      <td className="py-3 px-2 hidden lg:table-cell" aria-label={`7-day trend: ${token.change7d >= 0 ? 'up' : 'down'} ${Math.abs(token.change7d).toFixed(1)}%`}>
        <Sparkline data={token.sparkline7d} positive={token.change24h >= 0} />
      </td>
      <td className="py-3 px-1 text-right w-20 hidden sm:table-cell">
        <button
          onClick={(e) => { e.stopPropagation(); onSwapClick(token.symbol) }}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity px-3 py-1 text-xs font-medium rounded-lg bg-goodgreen/10 text-goodgreen hover:bg-goodgreen/20"
        >
          Swap
        </button>
      </td>
    </tr>
  )
})

function MarketCapSparkline({ value, positive }: { value: number; positive: boolean }) {
  const data = useMemo(() => {
    const points: number[] = []
    let v = value * (1 - 0.03 * (positive ? 1 : -1))
    const step = (value - v) / 13
    for (let i = 0; i < 14; i++) {
      const noise = (((i * 7 + 3) % 11) / 11 - 0.5) * value * 0.008
      points.push(v + noise)
      v += step
    }
    points[points.length - 1] = value
    return points
  }, [value, positive])

  const w = 120
  const h = 40
  const pad = 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const color = positive ? '#4ade80' : '#f87171'

  const coords = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: pad + (1 - (v - min) / range) * (h - pad * 2),
  }))

  const linePoints = coords.map(c => `${c.x},${c.y}`).join(' ')
  const areaPoints = `${coords[0].x},${h} ${linePoints} ${coords[coords.length - 1].x},${h}`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="hidden sm:inline-block" aria-hidden="true">
      <polygon points={areaPoints} fill={color} opacity={0.12} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MarketStatsBar({ tokens }: { tokens: TokenMarketData[] }) {
  const [activeCard, setActiveCard] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)

  const stats = useMemo(() => {
    const totalMarketCap = tokens.reduce((s, t) => s + t.marketCap, 0)
    const weightedChange = tokens.reduce((s, t) => s + t.change24h * t.marketCap, 0) / (totalMarketCap || 1)
    const trending = [...tokens].sort((a, b) => b.volume24h - a.volume24h).slice(0, 3)
    const gainers = [...tokens].filter(t => t.change24h > 0).sort((a, b) => b.change24h - a.change24h).slice(0, 3)
    return { totalMarketCap, weightedChange, trending, gainers }
  }, [tokens])

  const cards = [
    {
      title: "Total Market Cap",
      content: (
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-1.5 font-medium">Total Market Cap</div>
            <div className="text-xl font-bold text-white mb-0.5">{formatMarketCap(stats.totalMarketCap)}</div>
            <span className={`text-xs font-medium ${stats.weightedChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.weightedChange >= 0 ? '▲' : '▼'} {Math.abs(stats.weightedChange).toFixed(2)}% (24h)
            </span>
          </div>
          <MarketCapSparkline value={stats.totalMarketCap} positive={stats.weightedChange >= 0} />
        </div>
      )
    },
    {
      title: "Trending",
      content: (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium">
            <svg className="w-3.5 h-3.5 text-orange-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2Z"/></svg>
            Trending
          </div>
          <div className="space-y-1.5">
            {stats.trending.map((t, i) => (
              <div key={t.symbol} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600 w-3">{i + 1}</span>
                  <TokenIcon symbol={t.symbol} size={16} />
                  <span className="text-white font-medium">{t.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{formatPrice(t.price)}</span>
                  <span className={t.change24h >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {t.change24h >= 0 ? '▲' : '▼'}{Math.abs(t.change24h).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
            {stats.trending.length < 3 && Array.from({ length: 3 - stats.trending.length }).map((_, i) => (
              <div key={`t-e-${i}`} className="flex items-center text-xs text-gray-700 italic py-0.5">
                <span className="w-3 mr-1.5">{stats.trending.length + i + 1}</span>
                No more data
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: "Top Gainers",
      content: (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium">
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            Top Gainers
          </div>
          <div className="space-y-1.5">
            {stats.gainers.map((t, i) => (
              <div key={t.symbol} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600 w-3">{i + 1}</span>
                  <TokenIcon symbol={t.symbol} size={16} />
                  <span className="text-white font-medium">{t.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{formatPrice(t.price)}</span>
                  <span className="text-green-400">
                    ▲{t.change24h.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
            {stats.gainers.length < 3 && Array.from({ length: 3 - stats.gainers.length }).map((_, i) => (
              <div key={`g-e-${i}`} className="flex items-center text-xs text-gray-700 italic py-0.5">
                <span className="w-3 mr-1.5">{stats.gainers.length + i + 1}</span>
                No more gainers today
              </div>
            ))}
          </div>
        </div>
      )
    }
  ]

  const handlePan = (_: any, info: PanInfo) => {
    setDragOffset(info.offset.x)
  }

  const handlePanStart = () => {
    // Add haptic feedback on supported devices
    if ('vibrate' in navigator) {
      navigator.vibrate(10)
    }
  }

  const handlePanEnd = (_: any, info: PanInfo) => {
    const threshold = 50 // Minimum swipe distance to trigger change
    const velocity = Math.abs(info.velocity.x)

    let newCard = activeCard

    if (Math.abs(info.offset.x) > threshold || velocity > 500) {
      if (info.offset.x > 0 && activeCard > 0) {
        // Swipe right - go to previous card
        newCard = activeCard - 1
      } else if (info.offset.x < 0 && activeCard < cards.length - 1) {
        // Swipe left - go to next card
        newCard = activeCard + 1
      }

      // Haptic feedback on successful card change
      if (newCard !== activeCard && 'vibrate' in navigator) {
        navigator.vibrate(20)
      }
    }

    setActiveCard(newCard)
    setDragOffset(0)
  }

  return (
    <div className="mb-6">
      {/* Desktop: Grid layout */}
      <div className="hidden md:grid grid-cols-3 gap-3">
        {cards.map((card, index) => (
          <div key={card.title} className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4">
            {card.content}
          </div>
        ))}
      </div>

      {/* Mobile: Swipeable carousel */}
      <div className="md:hidden relative overflow-hidden">
        <motion.div
          className="flex transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(calc(-${activeCard * 100}% + ${dragOffset}px))`,
            cursor: dragOffset !== 0 ? 'grabbing' : 'grab'
          }}
          onPanStart={handlePanStart}
          onPan={handlePan}
          onPanEnd={handlePanEnd}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          whileTap={{ scale: 0.98 }}
        >
          {cards.map((card, index) => (
            <motion.div
              key={card.title}
              className="w-full flex-shrink-0 px-1"
              animate={{
                opacity: Math.abs(index - activeCard) <= 1 ? 1 : 0.3,
                scale: index === activeCard ? 1 : 0.95
              }}
              transition={{
                duration: 0.3,
                ease: [0.25, 0.46, 0.45, 0.94] // Custom easing for smooth feel
              }}
            >
              <div className={`bg-dark-100 rounded-2xl border p-4 mx-2 touch-pan-y transition-all duration-200 ${
                index === activeCard
                  ? 'border-goodgreen/30 shadow-lg shadow-goodgreen/10'
                  : 'border-gray-700/20'
              }`}>
                {card.content}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mt-3">
          {cards.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveCard(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === activeCard ? 'bg-goodgreen' : 'bg-gray-600'
              }`}
              aria-label={`Go to ${cards[index].title} card`}
            />
          ))}
        </div>

        {/* Swipe hint for first-time users */}
        {activeCard === 0 && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
            </svg>
            swipe to explore
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ExplorePage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<TokenCategory | 'All'>('All')
  const [sortField, setSortField] = useState<SortField>('marketCap')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const { tokens: data } = useOnChainMarketData()

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    let tokens = data
    if (selectedCategory !== 'All') {
      tokens = tokens.filter(t => t.category === selectedCategory)
    }
    const trimmed = query.trim()
    if (trimmed) {
      const q = trimmed.toLowerCase()
      tokens = tokens.filter(t =>
        t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
      )
    }
    return [...tokens].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1
      return (a[sortField] - b[sortField]) * mul
    })
  }, [data, query, selectedCategory, sortField, sortDir])

  const handleRowClick = useCallback((symbol: string) => {
    router.push(`/explore/${symbol}`)
  }, [router])

  const handleSwapClick = useCallback((symbol: string) => {
    router.push(`/?buy=${symbol}`)
  }, [router])

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Explore Tokens</h1>
        <p className="text-sm text-gray-400">Browse token prices, volume, and market data on GoodDollar L2</p>
      </div>

      <MarketStatsBar tokens={data} />

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search tokens..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full sm:w-72 px-4 py-2.5 rounded-xl bg-dark-100 border border-gray-700/30 text-white placeholder:text-gray-500 text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:border-goodgreen/30"
        />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('All')}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedCategory === 'All' ? 'bg-goodgreen/15 text-goodgreen border border-goodgreen/20' : 'text-gray-400 hover:text-white bg-dark-100 border border-gray-700/20'}`}
        >
          All
        </button>
        {TOKEN_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedCategory === cat ? 'bg-goodgreen/15 text-goodgreen border border-goodgreen/20' : 'text-gray-400 hover:text-white bg-dark-100 border border-gray-700/20'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700/30 text-gray-400 bg-dark-50/25">
                <th className="text-right py-3 px-3 font-semibold w-10">#</th>
                <th className="text-left py-3 px-3 font-semibold">Token</th>
                <th
                  className="text-right py-3 px-3 font-semibold cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('price')}
                >
                  Price <SortArrow active={sortField === 'price'} dir={sortDir} />
                </th>
                <th
                  className="text-right py-3 px-2 font-semibold cursor-pointer hover:text-white transition-colors hidden lg:table-cell"
                  onClick={() => handleSort('change1h')}
                >
                  1h <SortArrow active={sortField === 'change1h'} dir={sortDir} />
                </th>
                <th
                  className="text-right py-3 px-3 font-semibold cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('change24h')}
                >
                  24h <SortArrow active={sortField === 'change24h'} dir={sortDir} />
                </th>
                <th
                  className="text-right py-3 px-2 font-semibold cursor-pointer hover:text-white transition-colors hidden lg:table-cell"
                  onClick={() => handleSort('change7d')}
                >
                  7d <SortArrow active={sortField === 'change7d'} dir={sortDir} />
                </th>
                <th
                  className="text-right py-3 px-3 font-semibold cursor-pointer hover:text-white transition-colors hidden sm:table-cell"
                  onClick={() => handleSort('volume24h')}
                >
                  Volume <SortArrow active={sortField === 'volume24h'} dir={sortDir} />
                </th>
                <th
                  className="text-right py-3 px-3 font-semibold cursor-pointer hover:text-white transition-colors hidden md:table-cell"
                  onClick={() => handleSort('marketCap')}
                >
                  Market Cap <SortArrow active={sortField === 'marketCap'} dir={sortDir} />
                </th>
                <th className="py-3 px-2 font-semibold hidden lg:table-cell">7d Trend</th>
                <th className="w-20 hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    No tokens match your search
                  </td>
                </tr>
              ) : (
                filtered.map((token, idx) => (
                  <TokenRow key={token.symbol} token={token} idx={idx} onRowClick={handleRowClick} onSwapClick={handleSwapClick} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center mt-4">
        Prices shown are illustrative. Real-time data coming soon.
      </p>
    </div>
  )
}
