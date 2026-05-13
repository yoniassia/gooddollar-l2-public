'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/registerServiceWorker'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Register service worker after initial page load
    registerServiceWorker()
  }, [])

  // This component doesn't render anything
  return null
}