import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 rounded-full bg-dark-50 border border-gray-700/30 flex items-center justify-center mb-6">
        <span className="text-4xl">🔍</span>
      </div>

      <h1 className="text-5xl font-bold text-white mb-3">404</h1>
      <p className="text-lg text-gray-400 mb-2">Page Not Found</p>
      <p className="text-sm text-gray-500 max-w-xs mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <Button asChild size="lg">
        <Link href="/">
          Back to Swap
        </Link>
      </Button>
    </div>
  )
}
