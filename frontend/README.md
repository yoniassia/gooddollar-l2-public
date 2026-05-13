# GoodSwap — Every Swap Funds UBI

> The first DEX on GoodDollar L2. 33% of every swap fee automatically funds universal basic income.

🌐 **Live:** [goodswap.goodclaw.org](https://goodswap.goodclaw.org)

## Quick Start

```bash
cd frontend
npm install
npm run dev     # http://localhost:3100
```

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Web3:** wagmi + viem + RainbowKit
- **Language:** TypeScript
- **Testing:** Vitest

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing + swap widget |
| `/explore` | Token explorer (18 tokens, prices, volume) |
| `/bridge` | Cross-chain bridge (coming soon) |
| `/pool` | Liquidity pools (coming soon) |

## Features

- ✅ Swap interface with real-time token selection
- ✅ Full-screen token selector with search & quick-select chips
- ✅ Swap review modal with price impact warnings
- ✅ Slippage settings with custom input + clamping
- ✅ USD fiat equivalents on all amounts
- ✅ Recent activity panel (localStorage)
- ✅ Mobile responsive + keyboard accessible
- ✅ Lazy-loaded wallet providers
- ✅ Memoized components for performance
- ✅ SVG token logos for all 18 tokens

## Build & Deploy

```bash
npm run build       # Production build
npm run start       # Production server on :3100

# Static export (for GitHub Pages / CDN)
# Add `output: 'export'` to next.config.js, then:
npx next build
# Deploy `out/` directory
```

Currently deployed via GitHub Pages → Cloudflare CDN.
