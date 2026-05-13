'use client'

import { useEffect } from 'react'

/**
 * Initializes @axe-core/react in development to log WCAG violations to the console.
 * Rendered in layout.tsx — no-ops in production.
 */
export function AxeDevTools() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      import('@axe-core/react').then(axe => {
        const React = require('react')
        const ReactDOM = require('react-dom')
        axe.default(React, ReactDOM, 1000)
      })
    }
  }, [])

  return null
}
