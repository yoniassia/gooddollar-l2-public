'use client'

import { useRef } from 'react'

interface StartSwappingCTAProps {
  swapCardRef?: React.RefObject<HTMLElement | null>
}

export function StartSwappingCTA({ swapCardRef }: StartSwappingCTAProps = {}) {
  const handleClick = () => {
    const card = swapCardRef?.current ?? document.getElementById('swap-card')
    if (!card) return
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const input = card.querySelector<HTMLInputElement>('input[inputmode="decimal"]')
    input?.focus({ preventScroll: true })
  }

  return (
    <div className="mt-10 mb-2 flex justify-center">
      <button
        onClick={handleClick}
        className="group px-8 py-3 rounded-full bg-goodgreen text-dark font-semibold text-sm hover:bg-goodgreen/90 transition-colors shadow-lg shadow-goodgreen/20"
      >
        Start Trading
        <span className="inline-block ml-1.5 transition-transform group-hover:translate-x-0.5">&rarr;</span>
      </button>
    </div>
  )
}
