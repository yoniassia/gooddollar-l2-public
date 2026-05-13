import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { Providers } from '@/components/Providers'
import { Header } from '@/components/Header'
import { UBIBanner } from '@/components/UBIBanner'
import { LandingFooter } from '@/components/LandingFooter'
import { PageTransition } from '@/components/PageTransition'
import { AxeDevTools } from '@/components/AxeDevTools'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary'
import { Toaster } from '@/components/ui/toast'

export const metadata: Metadata = {
  title: {
    default: 'GoodDollar — DeFi That Funds UBI',
    template: '%s | GoodDollar',
  },
  description: 'Trade, predict, and invest on GoodDollar L2. Every platform interaction automatically funds universal basic income for verified humans worldwide.',
  openGraph: {
    title: 'GoodDollar — DeFi That Funds UBI',
    description: 'Trade, predict, and invest on GoodDollar L2. Every fee funds universal basic income.',
    siteName: 'GoodDollar',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GoodDollar — DeFi That Funds UBI',
    description: 'Trade, predict, and invest on GoodDollar L2. Every fee funds universal basic income.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="font-sans min-h-screen flex flex-col">
        {/* Skip to main content — WCAG 2.4.1 */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-goodgreen focus:text-dark focus:rounded-lg focus:font-medium focus:text-sm"
        >
          Skip to main content
        </a>
        <GlobalErrorBoundary>
          <Providers>
            <Header />
            <UBIBanner />
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 flex flex-col items-center px-4 pt-8 pb-12 outline-none"
            >
              <PageTransition>{children}</PageTransition>
            </main>
            <LandingFooter />
            <Toaster />
          </Providers>
        </GlobalErrorBoundary>
        {process.env.VERCEL && <Analytics />}
        {process.env.VERCEL && <SpeedInsights />}
        <ServiceWorkerRegistration />
        <AxeDevTools />
      </body>
    </html>
  )
}
