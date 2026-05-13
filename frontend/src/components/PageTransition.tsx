'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'

const variants = {
  hidden: { opacity: 0, y: 8 },
  enter:  { opacity: 1, y: 0 },
  exit:   { opacity: 0, y: -8 },
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial="hidden"
        animate="enter"
        exit="exit"
        variants={variants}
        transition={{ duration: 0.18, ease: 'easeInOut' }}
        className="flex-1 flex flex-col items-center w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
