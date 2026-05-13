// GoodDollar L2 Service Worker
// Provides offline caching for static assets and API responses

const CACHE_NAME = 'gooddollar-v1.0.0'
const STATIC_CACHE = `${CACHE_NAME}-static`
const DYNAMIC_CACHE = `${CACHE_NAME}-dynamic`

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  // Add critical static assets here
]

// API endpoints to cache with strategy
const API_CACHE_PATTERNS = [
  /^https:\/\/api\.coingecko\.com\/api\/v3\/simple\/price/,
  /^https:\/\/rpc\.gooddollar\.org/,
  /^https:\/\/clapi\.gooddollar\.org/,
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheName.startsWith(CACHE_NAME)) {
            console.log('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return
  }

  // Strategy 1: Cache First for static assets
  if (request.destination === 'image' ||
      request.destination === 'font' ||
      request.destination === 'script' ||
      request.destination === 'style') {

    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse
          }

          return fetch(request).then((response) => {
            // Cache successful responses
            if (response.status === 200) {
              const responseClone = response.clone()
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone)
              })
            }
            return response
          })
        })
        .catch(() => {
          // Return offline fallback for critical assets
          console.log('[SW] Failed to fetch asset:', request.url)
        })
    )
    return
  }

  // Strategy 2: Network First for API calls (with cache fallback)
  const isAPICall = API_CACHE_PATTERNS.some(pattern => pattern.test(request.url))

  if (isAPICall) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses for 5 minutes
          if (response.status === 200) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)

              // Set expiration for API cache (5 minutes)
              setTimeout(() => {
                cache.delete(request)
              }, 5 * 60 * 1000)
            })
          }
          return response
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[SW] Using cached API response:', request.url)
              return cachedResponse
            }
            throw new Error('No cached response available')
          })
        })
    )
    return
  }

  // Strategy 3: Network First for navigation (HTML pages)
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          return caches.match(request) || caches.match('/')
        })
    )
  }
})

// Background sync for offline actions (if needed)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag)

  if (event.tag === 'background-price-sync') {
    event.waitUntil(
      // Implement background price feed sync
      console.log('[SW] Syncing price feeds in background')
    )
  }
})

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received')

  const options = {
    body: 'GoodDollar L2 notification',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
    },
  }

  event.waitUntil(
    self.registration.showNotification('GoodDollar L2', options)
  )
})