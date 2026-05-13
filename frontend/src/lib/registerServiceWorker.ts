// Service Worker Registration for GoodDollar L2
// Provides offline caching and performance optimizations

'use client'

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('Service Worker not supported')
    return
  }

  // Only register in production or when explicitly enabled
  const isProduction = process.env.NODE_ENV === 'production'
  const enableSW = process.env.NEXT_PUBLIC_ENABLE_SW === 'true'

  if (!isProduction && !enableSW) {
    console.log('Service Worker disabled in development')
    return
  }

  try {
    console.log('Registering Service Worker...')

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none', // Always check for updates
    })

    console.log('Service Worker registered successfully:', registration.scope)

    // Handle service worker updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (newWorker) {
        console.log('New Service Worker available')

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Show update notification to user
            showUpdateNotification()
          }
        })
      }
    })

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('Message from Service Worker:', event.data)

      if (event.data.type === 'CACHE_UPDATED') {
        // Handle cache updates
        console.log('Cache updated for:', event.data.url)
      }
    })

    // Check for updates periodically (every 30 minutes)
    setInterval(() => {
      registration.update()
    }, 30 * 60 * 1000)

  } catch (error) {
    console.error('Service Worker registration failed:', error)
  }
}

function showUpdateNotification(): void {
  // Create a subtle update notification
  const notification = document.createElement('div')
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: #00B0A0;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 176, 160, 0.3);
      z-index: 9999;
      cursor: pointer;
      transition: opacity 0.3s ease;
    ">
      🔄 App updated! Click to reload
    </div>
  `

  const notificationEl = notification.firstElementChild as HTMLElement
  document.body.appendChild(notificationEl)

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (notificationEl.parentNode) {
      notificationEl.style.opacity = '0'
      setTimeout(() => {
        notificationEl.remove()
      }, 300)
    }
  }, 10_000)

  // Reload on click
  notificationEl.addEventListener('click', () => {
    window.location.reload()
  })
}

// Utility function to check if app is running offline
export function isOffline(): boolean {
  return !navigator.onLine
}

// Utility function to check if service worker is active
export function isServiceWorkerActive(): boolean {
  return !!(navigator.serviceWorker?.controller)
}

// Background sync registration for offline actions
export function requestBackgroundSync(tag: string): void {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      return (registration as any).sync.register(tag)
    }).catch((error) => {
      console.error('Background sync registration failed:', error)
    })
  }
}