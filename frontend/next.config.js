/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stop browsers leaking referrer to third-party origins
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Prevent MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Enable XSS filter in older browsers
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Require HTTPS for 1 year (only active in production)
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
    : []),
  // Permissions policy — deny access to camera, mic, geolocation
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Content-Security-Policy
  // Allows: self, specific CDNs for fonts/images, wagmi/viem RPC endpoints,
  //         CoinGecko price feeds, and inline styles (needed by Tailwind).
  // 'unsafe-eval' is required by wagmi/viem WebAssembly modules.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: self + wagmi/rainbowkit bundles; unsafe-eval for WASM; unsafe-inline for Next.js RSC inline scripts
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      // Styles: self + inline (Tailwind injects via style attributes)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts
      "font-src 'self' https://fonts.gstatic.com",
      // Images: self + data URIs (token icons) + trusted CDNs
      "img-src 'self' data: https:",
      // Connect: self + known blockchain/price-feed endpoints
      [
        "connect-src 'self'",
        'https://*.alchemyapi.io',
        'https://*.g.alchemy.com',
        'wss://*.alchemyapi.io',
        'wss://*.g.alchemy.com',
        'https://api.coingecko.com',
        'https://*.infura.io',
        'wss://*.infura.io',
        'https://api.walletconnect.com',
        'wss://*.walletconnect.com',
        'https://explorer-api.walletconnect.com',
        'https://rpc.gooddollar.org',
        'https://clapi.gooddollar.org',
        'https://rpc.goodclaw.org',
        'wss://rpc.goodclaw.org',
        'https://pulse.walletconnect.org',
        'wss://pulse.walletconnect.org',
        'https://api.web3modal.org',
      ].join(' '),
      // Iframes: deny (no wallet iframes needed)
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },

  experimental: {
    optimizePackageImports: [
      'viem',
      'wagmi',
      '@rainbow-me/rainbowkit',
      '@tanstack/react-query',
    ],
  },
  webpack: (config) => {
    // Bundle optimization for better caching and performance
    config.optimization.splitChunks = {
      ...config.optimization.splitChunks,
      cacheGroups: {
        ...config.optimization.splitChunks.cacheGroups,
        // Web3 vendor chunk for better caching
        web3: {
          name: 'web3-vendor',
          chunks: 'all',
          test: /[\\/]node_modules[\\/](@wagmi|viem|@rainbow-me|@walletconnect)/,
          priority: 30,
          reuseExistingChunk: true,
        },
        // UI vendor chunk
        ui: {
          name: 'ui-vendor',
          chunks: 'all',
          test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|framer-motion)/,
          priority: 25,
          reuseExistingChunk: true,
        },
        // React vendor chunk
        react: {
          name: 'react-vendor',
          chunks: 'all',
          test: /[\\/]node_modules[\\/](react|react-dom|@tanstack\/react-query)/,
          priority: 20,
          reuseExistingChunk: true,
        },
      },
    }

    config.resolve.fallback = {
      ...config.resolve.fallback,
      'porto/internal': false,
    }
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}
module.exports = withBundleAnalyzer(nextConfig)
