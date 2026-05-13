'use client'

import { useEffect, useRef } from 'react'
import { useSpring, useMotionValue, useTransform, motion } from 'framer-motion'

interface AnimatedNumberProps {
  value: number
  /** decimal places to show, default 2 */
  decimals?: number
  className?: string
}

export function AnimatedNumber({ value, decimals = 2, className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(value)
  const spring = useSpring(motionValue, { stiffness: 80, damping: 20 })
  const display = useTransform(spring, (v) => v.toFixed(decimals))

  useEffect(() => {
    motionValue.set(value)
  }, [value, motionValue])

  return <motion.span className={className}>{display}</motion.span>
}
