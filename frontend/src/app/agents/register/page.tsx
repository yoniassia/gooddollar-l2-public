'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { isAddress } from 'viem'
import { useAccount } from 'wagmi'
import { useAgentRegister } from '@/lib/useAgentRegister'

const STRATEGY_PRESETS = [
  { label: 'Momentum Trading', value: 'momentum' },
  { label: 'Arbitrage', value: 'arbitrage' },
  { label: 'Market Making', value: 'market-making' },
  { label: 'Yield Farming', value: 'yield-farming' },
  { label: 'Prediction Markets', value: 'prediction' },
  { label: 'Multi-Strategy', value: 'multi-strategy' },
  { label: 'Custom', value: '' },
]

function StatusBanner({ status, error, txHash }: { status: string; error: string | null; txHash?: string }) {
  if (status === 'confirming') {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
        <span className="text-xl animate-pulse">⏳</span>
        <div>
          <div className="font-semibold text-yellow-400 text-sm">Confirm in Wallet</div>
          <div className="text-xs text-yellow-400/70">Please confirm the transaction in your wallet</div>
        </div>
      </div>
    )
  }
  if (status === 'pending') {
    return (
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-center gap-3">
        <span className="text-xl animate-spin">⚙️</span>
        <div>
          <div className="font-semibold text-blue-400 text-sm">Transaction Pending</div>
          <div className="text-xs text-blue-400/70 font-mono">{txHash?.slice(0, 10)}…{txHash?.slice(-8)}</div>
        </div>
      </div>
    )
  }
  if (status === 'success') {
    return (
      <div className="bg-goodgreen/10 border border-goodgreen/30 rounded-xl p-4 flex items-center gap-3">
        <span className="text-xl">✅</span>
        <div>
          <div className="font-semibold text-goodgreen text-sm">Agent Registered!</div>
          <div className="text-xs text-goodgreen/70">Your agent is now live on the leaderboard</div>
        </div>
      </div>
    )
  }
  if (status === 'error' && error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
        <span className="text-xl">❌</span>
        <div>
          <div className="font-semibold text-red-400 text-sm">Registration Failed</div>
          <div className="text-xs text-red-400/70 line-clamp-2">{error}</div>
        </div>
      </div>
    )
  }
  return null
}

export default function RegisterAgentPage() {
  const [name, setName] = useState('')
  const [agentAddress, setAgentAddress] = useState('')
  const [avatarURI, setAvatarURI] = useState('')
  const [strategyPreset, setStrategyPreset] = useState('momentum')
  const [customStrategy, setCustomStrategy] = useState('')
  const [useSelfAsAgent, setUseSelfAsAgent] = useState(true)

  const strategy = strategyPreset || customStrategy

  const { address: connectedAddress, isConnected } = useAccount()

  const resolvedAgent = useMemo(() => {
    if (useSelfAsAgent) return connectedAddress
    return isAddress(agentAddress) ? agentAddress as `0x${string}` : undefined
  }, [useSelfAsAgent, agentAddress, connectedAddress])

  const {
    register,
    status,
    error,
    txHash,
    isAlreadyRegistered,
  } = useAgentRegister(resolvedAgent)

  const effectiveAgent = resolvedAgent

  const canSubmit = useMemo(() => {
    if (!isConnected) return false
    if (!name.trim()) return false
    if (!effectiveAgent) return false
    if (isAlreadyRegistered) return false
    if (status === 'confirming' || status === 'pending') return false
    return true
  }, [isConnected, name, effectiveAgent, isAlreadyRegistered, status])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !effectiveAgent) return
    register(effectiveAgent, name.trim(), avatarURI.trim(), strategy)
  }

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/agents" className="text-xs text-gray-400 hover:text-goodgreen transition-colors">
          ← Back to Leaderboard
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">🤖 Register Your Agent</h1>
        <p className="text-sm text-gray-400 mt-1">
          Connect your wallet and register your AI trading agent on-chain
        </p>
      </div>

      {/* Status */}
      <StatusBanner status={status} error={error} txHash={txHash} />

      {/* Success CTA */}
      {status === 'success' && effectiveAgent && (
        <div className="flex gap-3">
          <Link
            href={`/agents/${effectiveAgent}`}
            className="flex-1 text-center px-4 py-2 bg-goodgreen/20 border border-goodgreen/30 rounded-lg text-goodgreen text-sm font-medium hover:bg-goodgreen/30 transition-colors"
          >
            View Agent Profile →
          </Link>
          <Link
            href="/agents"
            className="flex-1 text-center px-4 py-2 bg-gray-700/30 border border-gray-600/30 rounded-lg text-gray-300 text-sm font-medium hover:bg-gray-700/50 transition-colors"
          >
            Back to Leaderboard
          </Link>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Wallet status */}
        <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Connected Wallet</span>
            {isConnected ? (
              <span className="text-xs font-mono text-goodgreen">
                {connectedAddress?.slice(0, 6)}…{connectedAddress?.slice(-4)}
              </span>
            ) : (
              <span className="text-xs text-red-400">Not connected — use wallet button above</span>
            )}
          </div>
        </div>

        {/* Agent address toggle */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useSelfAsAgent}
              onChange={(e) => setUseSelfAsAgent(e.target.checked)}
              className="rounded border-gray-600 bg-dark-100 text-goodgreen focus:ring-goodgreen/30"
            />
            <span className="text-sm text-gray-300">Use my wallet as the agent address</span>
          </label>

          {!useSelfAsAgent && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Agent Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={agentAddress}
                onChange={(e) => setAgentAddress(e.target.value)}
                className="w-full bg-dark-100 border border-gray-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-goodgreen/50 focus:outline-none font-mono"
              />
              {agentAddress && !isAddress(agentAddress) && (
                <p className="text-xs text-red-400 mt-1">Invalid address</p>
              )}
            </div>
          )}
        </div>

        {/* Already registered warning */}
        {isAlreadyRegistered && effectiveAgent && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            <p className="text-xs text-yellow-400">
              ⚠️ This address is already registered.{' '}
              <Link href={`/agents/${effectiveAgent}`} className="underline hover:text-yellow-300">
                View profile →
              </Link>
            </p>
          </div>
        )}

        {/* Agent name */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Agent Name *</label>
          <input
            type="text"
            placeholder="e.g., AlphaBot, YieldHunter, PerpMaster"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            className="w-full bg-dark-100 border border-gray-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-goodgreen/50 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">{name.length}/32 characters</p>
        </div>

        {/* Avatar URI (optional) */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Avatar URL <span className="text-gray-600">(optional)</span></label>
          <input
            type="text"
            placeholder="https://example.com/avatar.png"
            value={avatarURI}
            onChange={(e) => setAvatarURI(e.target.value)}
            className="w-full bg-dark-100 border border-gray-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-goodgreen/50 focus:outline-none"
          />
        </div>

        {/* Strategy */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Trading Strategy</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {STRATEGY_PRESETS.map((preset) => (
              <button
                key={preset.value ?? 'custom'}
                type="button"
                onClick={() => setStrategyPreset(preset.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  strategyPreset === preset.value
                    ? 'bg-goodgreen/20 border-goodgreen/40 text-goodgreen'
                    : 'bg-dark-100 border-gray-700/30 text-gray-400 hover:border-gray-600'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {strategyPreset === '' && (
            <input
              type="text"
              placeholder="Describe your custom strategy..."
              value={customStrategy}
              onChange={(e) => setCustomStrategy(e.target.value)}
              maxLength={64}
              className="w-full bg-dark-100 border border-gray-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-goodgreen/50 focus:outline-none"
            />
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
            canSubmit
              ? 'bg-goodgreen text-black hover:bg-goodgreen/90 shadow-lg shadow-goodgreen/20'
              : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
          }`}
        >
          {!isConnected
            ? 'Connect Wallet to Register'
            : isAlreadyRegistered
            ? 'Agent Already Registered'
            : status === 'confirming'
            ? 'Confirm in Wallet…'
            : status === 'pending'
            ? 'Registering…'
            : '🤖 Register Agent'}
        </button>
      </form>

      {/* Info box */}
      <div className="bg-dark-100/50 rounded-xl border border-gray-700/10 p-4 space-y-2">
        <h3 className="text-xs font-semibold text-gray-400">How it works</h3>
        <ul className="text-xs text-gray-500 space-y-1.5">
          <li className="flex gap-2"><span>1.</span> Register your agent address on-chain</li>
          <li className="flex gap-2"><span>2.</span> Your agent trades via the SDK (swaps, perps, predict, lend, stocks)</li>
          <li className="flex gap-2"><span>3.</span> Every trade generates fees — 33% goes to fund UBI</li>
          <li className="flex gap-2"><span>4.</span> Climb the leaderboard by contributing the most UBI</li>
        </ul>
        <div className="pt-2 border-t border-gray-700/10">
          <code className="text-[10px] text-goodgreen/60">npm install @gooddollar/agent-sdk</code>
        </div>
      </div>
    </div>
  )
}
