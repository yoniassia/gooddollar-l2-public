'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Menu, X } from 'lucide-react'
import { WalletButton } from './WalletButton'
import { ActivityButton } from './ActivityButton'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const isSwap = pathname === '/'
  const isExplore = pathname === '/explore'
  const isPool = pathname === '/pool'
  const isBridge = pathname === '/bridge'
  const isStable = pathname?.startsWith('/stable')
  const isStocks = pathname?.startsWith('/stocks')
  const isPredict = pathname?.startsWith('/predict')
  const isPerps = pathname?.startsWith('/perps')
  const isLend = pathname?.startsWith('/lend')
  const isYield = pathname?.startsWith('/yield')
  const isGovernance = pathname?.startsWith('/governance')
  const isUBIImpact = pathname?.startsWith('/ubi-impact')
  const isAgents = pathname?.startsWith('/agents')
  const isActivity = pathname?.startsWith('/activity')
  const isTestDashboard = pathname?.startsWith('/test-dashboard')
  const isPortfolio = pathname === '/portfolio'

  useEffect(() => {
    if (!mobileMenuOpen) return

    document.body.style.overflow = 'hidden'

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [mobileMenuOpen])

  return (
    <header className="w-full border-b border-dark-50/50 bg-dark-100/80 backdrop-blur-md relative z-50">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-goodgreen flex items-center justify-center font-bold text-dark text-sm">
            G$
          </div>
          <span className="text-lg font-semibold text-white">GoodDollar</span>
        </div>

        <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-400">
          <Link href="/" className={isSwap ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Swap</Link>
          <Link href="/explore" className={isExplore ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Explore</Link>
          <Link href="/pool" className={`flex items-center gap-1.5 ${isPool ? 'text-white font-medium' : 'hover:text-white transition-colors'}`}>
            Pool
            <span data-testid="soon-badge" className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-500/20 text-orange-400 rounded border border-orange-500/30">
              Soon
            </span>
          </Link>
          <Link href="/bridge" className={`flex items-center gap-1.5 ${isBridge ? 'text-white font-medium' : 'hover:text-white transition-colors'}`}>
            Bridge
            <span data-testid="soon-badge" className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-500/20 text-orange-400 rounded border border-orange-500/30">
              Soon
            </span>
          </Link>
          <Link href="/stocks" className={isStocks ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Stocks</Link>
          <Link href="/predict" className={isPredict ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Predict</Link>
          <Link href="/perps" className={isPerps ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Perps</Link>
          <Link href="/lend" className={isLend ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Lend</Link>
          <Link href="/stable" className={isStable ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Stable</Link>
          <Link href="/yield" className={isYield ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Yield</Link>
          <Link href="/governance" className={isGovernance ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Govern</Link>
          <Link href="/agents" className={isAgents ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Agents</Link>
          <Link href="/ubi-impact" className={isUBIImpact ? 'text-green-400 font-medium' : 'text-green-400/60 hover:text-green-400 transition-colors'}>UBI</Link>
          <Link href="/activity" className={isActivity ? 'text-goodgreen font-medium' : 'text-goodgreen/60 hover:text-goodgreen transition-colors'}>
            <span className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-goodgreen animate-pulse" />
              Activity
            </span>
          </Link>
          <Link href="/test-dashboard" className={isTestDashboard ? 'text-white font-medium' : 'hover:text-white transition-colors'}>Tests</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/portfolio"
            aria-label="Portfolio"
            className={`p-2 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none ${isPortfolio ? 'text-white bg-dark-50' : 'text-gray-400 hover:text-white hover:bg-dark-50'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
          </Link>
          <ThemeToggle />
          <ActivityButton />
          <button
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileMenuOpen(o => !o)}
            className="sm:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-50 transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
          <WalletButton />
        </div>
      </div>

      {mobileMenuOpen && (
        <>
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
        <div
          ref={menuRef}
          data-testid="mobile-nav"
          className="sm:hidden border-t border-dark-50/50 bg-dark-100 backdrop-blur-md animate-in slide-in-from-top-2 duration-200 relative z-50"
        >
          <nav className="flex flex-col px-4 py-3 gap-1">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isSwap ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Swap
            </Link>
            <Link
              href="/explore"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isExplore ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Explore
            </Link>
            <Link
              href="/pool"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isPool ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Pool
              <span data-testid="soon-badge" className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-500/20 text-orange-400 rounded border border-orange-500/30">
                Coming Soon
              </span>
            </Link>
            <Link
              href="/bridge"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isBridge ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Bridge
              <span data-testid="soon-badge" className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-500/20 text-orange-400 rounded border border-orange-500/30">
                Coming Soon
              </span>
            </Link>
            <Link
              href="/stocks"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isStocks ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Stocks
            </Link>
            <Link
              href="/predict"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isPredict ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Predict
            </Link>
            <Link
              href="/perps"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isPerps ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Perps
            </Link>
            <Link
              href="/lend"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isLend ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Lend
            </Link>
            <Link
              href="/stable"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isStable ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Stable
            </Link>
            <Link
              href="/yield"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isYield ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Yield
            </Link>
            <Link
              href="/governance"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isGovernance ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Govern
            </Link>
            <Link
              href="/agents"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isAgents ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              🤖 Agents
            </Link>
            <Link
              href="/ubi-impact"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isUBIImpact ? 'text-green-400 font-medium bg-dark-50/50' : 'text-green-400/60 hover:text-green-400'}`}
            >
              🌍 UBI Impact
            </Link>
            <Link
              href="/activity"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isActivity ? 'text-goodgreen font-medium bg-dark-50/50' : 'text-goodgreen/60 hover:text-goodgreen'}`}
            >
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-goodgreen animate-pulse" />
                Activity
              </span>
            </Link>
            <Link
              href="/test-dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isTestDashboard ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Tests
            </Link>
            <div className="border-t border-dark-50/50 my-1" />
            <Link
              href="/portfolio"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isPortfolio ? 'text-white font-medium bg-dark-50/50' : 'text-gray-400 hover:text-white'}`}
            >
              Portfolio
            </Link>
          </nav>
        </div>
        </>
      )}
    </header>
  )
}
