'use client'

interface ConnectWalletEmptyStateProps {
  title?: string
  description?: string
  children: React.ReactNode
}

export function ConnectWalletEmptyState({
  title: _title,
  description: _description,
  children,
}: ConnectWalletEmptyStateProps) {
  // In demo mode, always show children (no wallet gate)
  return <>{children}</>
}
