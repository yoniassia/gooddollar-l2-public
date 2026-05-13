import Link from "next/link"

const products = [
  {
    name: "GoodSwap",
    description: "Swap any token with 0.1% fees funding UBI.",
    href: "/swap",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
    cta: "Start Swapping",
  },
  {
    name: "GoodStocks",
    description: "Trade synthetic equities 24/7. Fractional shares. Every trade funds UBI.",
    href: "/stocks",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
    cta: "View Stocks",
  },
  {
    name: "GoodPredict",
    description: "Bet on real-world events. Every trade funds UBI.",
    href: "/predict",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    cta: "View Markets",
  },
  {
    name: "GoodPerps",
    description: "Trade perpetual futures with up to 50x leverage. Every fee funds UBI.",
    href: "/perps",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    cta: "Trade Perps",
  },
  {
    name: "GoodLend",
    description: "Supply and borrow assets. Earn interest while funding UBI.",
    href: "/lend",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    cta: "Lend Now",
  },
  {
    name: "GoodStable",
    description: "Mint gUSD stablecoin by locking collateral. 33% of fees fund UBI.",
    href: "/stable",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    cta: "Open Vault",
  },
]

export function PlatformShowcase() {
  return (
    <section className="w-full max-w-2xl mx-auto mt-16 px-4">
      <h2 className="text-xl font-bold text-white text-center mb-2">Explore the Platform</h2>
      <p className="text-sm text-gray-400 text-center mb-8">
        Every product on GoodDollar routes fees to universal basic income.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products.map((product) => (
          <Link
            key={product.name}
            href={product.href}
            className="group flex flex-col p-5 rounded-2xl bg-dark-100/60 border border-gray-700/30 hover:border-goodgreen/40 hover:bg-dark-100/80 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-goodgreen/5 transition-all duration-200"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center text-goodgreen group-hover:bg-goodgreen/15 transition-colors">
                {product.icon}
              </div>
              <span className="text-base font-semibold text-white">{product.name}</span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed mb-4 flex-1">{product.description}</p>
            <span className="text-xs font-medium text-goodgreen group-hover:text-goodgreen/80 transition-colors">{product.cta} →</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
