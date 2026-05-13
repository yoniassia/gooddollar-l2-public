import { NextRequest, NextResponse } from 'next/server'


// ---------------------------------------------------------------------------
// In-memory rate limiter for API routes
//
// Limits each IP to RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW_MS.
// Production deployments on multi-instance infrastructure should replace this
// with a Redis-backed store (e.g. @upstash/ratelimit).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60       // requests per window
const RATE_LIMIT_WINDOW_MS = 60_000  // 1 minute

interface RateLimitEntry {
  count: number
  windowStart: number
}

// Simple in-process store — resets on server restart.
const ipStore = new Map<string, RateLimitEntry>()

function getRealIp(req: NextRequest): string {
  // Trust Vercel / Cloudflare / nginx forwarded headers in that order.
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    '127.0.0.1'
  )
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = ipStore.get(ip)

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // New window
    ipStore.set(ip, { count: 1, windowStart: now })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS }
  }

  entry.count += 1
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Apply rate limiting to API routes
  if (pathname.startsWith('/api/')) {
    const ip = getRealIp(req)
    const { allowed, remaining, resetAt } = checkRateLimit(ip)

    if (!allowed) {
      return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
        },
      })
    }

    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX))
    response.headers.set('X-RateLimit-Remaining', String(remaining))
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
    return response
  }

  // Skip i18n for static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('/sw.js') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // The app routes are not nested under /[locale], so applying next-intl's
  // locale middleware rewrites valid routes to locale-prefixed paths that do
  // not exist and makes production return 404. Keep public pages unmodified.
  return NextResponse.next()
}

export const config = {
  // Match API routes for rate limiting and all other routes for i18n
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.).*)',
  ],
}
