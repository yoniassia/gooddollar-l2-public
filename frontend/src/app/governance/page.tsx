'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatEther, parseEther } from 'viem'
import { InfoBanner } from '@/components/InfoBanner'
import {
  useVeGDLock,
  useVotingPower,
  useDelegatedVotes,
  useTotalVotingPower,
  useTotalLocked,
  useGDBalance,
  useGDAllowance,
  useApproveGD,
  useLockGD,
  useWithdrawGD,
  useEarlyUnlock,
  useDelegateVotes,
  useProposalCount,
  useProposal,
  useProposalState,
  useVoteReceipt,
  useCastVote,
  useQueueProposal,
  useExecuteProposal,
  useVotingDelay,
  useVotingPeriod,
  useTimelockDelay,
  useProposalThresholdBps,
  useQuorumBps,
  proposalStateName,
  proposalStateColor,
  proposalStateBg,
  formatDuration,
  formatVotes,
} from '@/lib/useGovernance'
import { sanitizeNumericInput } from '@/lib/format'

// ── Lock Duration Presets ─────────────────────────────────────────────────────

const LOCK_PRESETS = [
  { label: '1 Week', seconds: 7 * 86400 },
  { label: '1 Month', seconds: 30 * 86400 },
  { label: '6 Months', seconds: 180 * 86400 },
  { label: '1 Year', seconds: 365 * 86400 },
  { label: '2 Years', seconds: 2 * 365 * 86400 },
  { label: '4 Years (Max)', seconds: 4 * 365 * 86400 },
]

// ── veG$ Lock Panel ───────────────────────────────────────────────────────────

function VeLockPanel() {
  const { address } = useAccount()
  const [lockAmount, setLockAmount] = useState('')
  const [lockDuration, setLockDuration] = useState(365 * 86400)
  const [delegateAddr, setDelegateAddr] = useState('')

  const { data: lock } = useVeGDLock(address)
  const { data: votingPower } = useVotingPower(address)
  const { data: delegatedVotes } = useDelegatedVotes(address)
  const { data: totalPower } = useTotalVotingPower()
  const { data: totalLocked } = useTotalLocked()
  const { data: gdBalance } = useGDBalance(address)
  const { data: allowance } = useGDAllowance(address)

  const { approve, isPending: approving } = useApproveGD()
  const { lock: doLock, isPending: locking } = useLockGD()
  const { withdraw, isPending: withdrawing } = useWithdrawGD()
  const { earlyUnlock, isPending: unlocking } = useEarlyUnlock()
  const { delegate, isPending: delegating } = useDelegateVotes()

  const hasLock = lock && (lock as any)[0] > 0n
  const lockEnd = hasLock ? Number((lock as any)[1]) : 0
  const lockAmt = hasLock ? (lock as any)[0] as bigint : 0n
  const isExpired = hasLock && lockEnd < Math.floor(Date.now() / 1000)
  const daysRemaining = hasLock && !isExpired ? Math.max(0, Math.ceil((lockEnd - Date.now() / 1000) / 86400)) : 0

  const parsedAmount = useMemo(() => {
    try { return parseEther(lockAmount || '0') } catch { return 0n }
  }, [lockAmount])

  const needsApproval = parsedAmount > 0n && (!allowance || (allowance as bigint) < parsedAmount)

  // Projected voting power
  const maxLock = 4 * 365 * 86400
  const projectedPower = parsedAmount > 0n
    ? (parsedAmount * BigInt(lockDuration)) / BigInt(maxLock)
    : 0n

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
      <h2 className="text-xl font-bold text-white mb-4">🗳️ Vote-Escrowed G$ (veG$)</h2>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Total Locked" value={totalLocked ? `${formatVotes(totalLocked as bigint)} G$` : '—'} />
        <Stat label="Total Voting Power" value={totalPower ? formatVotes(totalPower as bigint) : '—'} />
        <Stat label="Your veG$ Power" value={votingPower ? formatVotes(votingPower as bigint) : '—'} />
        <Stat label="G$ Balance" value={gdBalance ? `${formatVotes(gdBalance as bigint)} G$` : '—'} />
      </div>

      {/* Existing Lock Info */}
      {hasLock && (
        <div className={`rounded-xl border p-4 mb-6 ${isExpired ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Your Lock</p>
              <p className="text-lg font-bold text-white">{formatVotes(lockAmt)} G$</p>
              <p className="text-sm text-gray-400">
                {isExpired ? '⚠️ Expired — withdraw available' : `${daysRemaining} days remaining`}
              </p>
            </div>
            <div className="flex gap-2">
              {isExpired ? (
                <button
                  onClick={() => withdraw()}
                  disabled={withdrawing}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium disabled:opacity-50"
                >
                  {withdrawing ? 'Withdrawing…' : 'Withdraw'}
                </button>
              ) : (
                <button
                  onClick={() => earlyUnlock()}
                  disabled={unlocking}
                  className="px-4 py-2 bg-red-600/80 hover:bg-red-500 rounded-lg text-white font-medium disabled:opacity-50"
                >
                  {unlocking ? 'Unlocking…' : 'Early Unlock (30% penalty)'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Lock Form */}
      {!hasLock && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Amount (G$)</label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={lockAmount}
                onChange={e => setLockAmount(sanitizeNumericInput(e.target.value))}
                placeholder="100,000"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 outline-none"
              />
              <button
                onClick={() => gdBalance && setLockAmount(formatEther(gdBalance as bigint))}
                className="px-3 py-2 text-sm text-blue-400 hover:text-blue-300 border border-gray-700 rounded-lg"
              >
                MAX
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Lock Duration</label>
            <div className="grid grid-cols-3 gap-2">
              {LOCK_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setLockDuration(p.seconds)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    lockDuration === p.seconds
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {projectedPower > 0n && (
            <div className="bg-gray-800 rounded-lg p-3 text-sm">
              <span className="text-gray-400">Projected voting power: </span>
              <span className="text-white font-medium">{formatVotes(projectedPower)} veG$</span>
              <span className="text-gray-500"> ({((Number(lockDuration) / maxLock) * 100).toFixed(0)}% of locked amount)</span>
            </div>
          )}

          <div className="flex gap-2">
            {needsApproval ? (
              <button
                onClick={() => approve(parsedAmount)}
                disabled={approving || parsedAmount === 0n}
                className="flex-1 px-4 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-white font-medium disabled:opacity-50"
              >
                {approving ? 'Approving…' : 'Approve G$'}
              </button>
            ) : (
              <button
                onClick={() => doLock(parsedAmount, BigInt(lockDuration))}
                disabled={locking || parsedAmount === 0n}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium disabled:opacity-50"
              >
                {locking ? 'Locking…' : `Lock for ${LOCK_PRESETS.find(p => p.seconds === lockDuration)?.label ?? formatDuration(lockDuration)}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Delegation */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Delegate Votes</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={delegateAddr}
            onChange={e => setDelegateAddr(e.target.value)}
            placeholder="0x… delegate address"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-500 outline-none"
          />
          <button
            onClick={() => delegateAddr && delegate(delegateAddr as `0x${string}`)}
            disabled={delegating || !delegateAddr}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          >
            {delegating ? '…' : 'Delegate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Proposal Card ─────────────────────────────────────────────────────────────

function ProposalCard({ id }: { id: number }) {
  const { address } = useAccount()
  const { data: proposal } = useProposal(id)
  const { data: stateNum } = useProposalState(id)
  const { data: receipt } = useVoteReceipt(id, address)
  const { castVote, isPending: voting } = useCastVote()
  const { queue, isPending: queueing } = useQueueProposal()
  const { execute, isPending: executing } = useExecuteProposal()

  if (!proposal) return null

  const p = proposal as any
  const state = proposalStateName(Number(stateNum ?? 0))
  const hasVoted = receipt && (receipt as any)[0]
  const totalVotes = (p.forVotes as bigint) + (p.againstVotes as bigint) + (p.abstainVotes as bigint)
  const forPct = totalVotes > 0n ? Number((p.forVotes as bigint) * 100n / totalVotes) : 0
  const againstPct = totalVotes > 0n ? Number((p.againstVotes as bigint) * 100n / totalVotes) : 0
  const abstainPct = totalVotes > 0n ? Number((p.abstainVotes as bigint) * 100n / totalVotes) : 0

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-gray-500 text-sm">Proposal #{id}</span>
          <p className="text-white font-medium mt-1">{p.description || 'Untitled Proposal'}</p>
          <p className="text-xs text-gray-500 mt-1">
            by {(p.proposer as string).slice(0, 8)}…{(p.proposer as string).slice(-6)}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded border ${proposalStateBg(state)} ${proposalStateColor(state)}`}>
          {state}
        </span>
      </div>

      {/* Vote Bars */}
      <div className="space-y-2 mb-4">
        <VoteBar label="For" votes={p.forVotes as bigint} pct={forPct} color="bg-green-500" />
        <VoteBar label="Against" votes={p.againstVotes as bigint} pct={againstPct} color="bg-red-500" />
        <VoteBar label="Abstain" votes={p.abstainVotes as bigint} pct={abstainPct} color="bg-gray-500" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {state === 'Active' && !hasVoted && (
          <>
            <button
              onClick={() => castVote(id, 1)}
              disabled={voting}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            >
              Vote For
            </button>
            <button
              onClick={() => castVote(id, 0)}
              disabled={voting}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            >
              Vote Against
            </button>
            <button
              onClick={() => castVote(id, 2)}
              disabled={voting}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            >
              Abstain
            </button>
          </>
        )}
        {hasVoted && (
          <span className="text-sm text-gray-400">
            ✓ Voted {['Against', 'For', 'Abstain'][(receipt as any)[1]] ?? ''}
          </span>
        )}
        {state === 'Succeeded' && (
          <button
            onClick={() => queue(id)}
            disabled={queueing}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          >
            {queueing ? 'Queuing…' : 'Queue for Execution'}
          </button>
        )}
        {state === 'Queued' && (
          <button
            onClick={() => execute(id)}
            disabled={executing}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          >
            {executing ? 'Executing…' : 'Execute'}
          </button>
        )}
      </div>
    </div>
  )
}

function VoteBar({ label, votes, pct, color }: { label: string; votes: bigint; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">{formatVotes(votes)} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Proposals List ────────────────────────────────────────────────────────────

function ProposalsList() {
  const { data: count } = useProposalCount()
  const proposalCount = Number(count ?? 0)

  const ids = useMemo(() => {
    const arr: number[] = []
    for (let i = proposalCount; i >= 1; i--) arr.push(i)
    return arr
  }, [proposalCount])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">📋 Proposals</h2>
      {proposalCount === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400 text-lg">No proposals yet</p>
          <p className="text-gray-500 text-sm mt-1">
            Lock G$ to get veG$ voting power, then create the first proposal
          </p>
        </div>
      ) : (
        ids.map(id => <ProposalCard key={id} id={id} />)
      )}
    </div>
  )
}

// ── Small Components ──────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-white mt-1">{value}</p>
    </div>
  )
}

// ── Governance Params ─────────────────────────────────────────────────────────

function GovernanceParams() {
  const { data: votingDelay } = useVotingDelay()
  const { data: votingPeriod } = useVotingPeriod()
  const { data: timelockDelay } = useTimelockDelay()
  const { data: thresholdBps } = useProposalThresholdBps()
  const { data: quorumBps } = useQuorumBps()

  function fmtSecs(val: bigint | undefined): string {
    if (val === undefined) return '…'
    const s = Number(val)
    if (s === 0) return '0s'
    return formatDuration(s)
  }

  function fmtBps(val: bigint | undefined): string {
    if (val === undefined) return '…'
    return (Number(val) / 100).toFixed(2).replace(/\.?0+$/, '') + '% of veG$'
  }

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Governance Parameters</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div><span className="text-gray-500">Proposal Threshold:</span> <span className="text-white">{fmtBps(thresholdBps as bigint | undefined)}</span></div>
        <div><span className="text-gray-500">Quorum:</span> <span className="text-white">{fmtBps(quorumBps as bigint | undefined)}</span></div>
        <div><span className="text-gray-500">Voting Period:</span> <span className="text-white">{fmtSecs(votingPeriod as bigint | undefined)}</span></div>
        <div><span className="text-gray-500">Voting Delay:</span> <span className="text-white">{fmtSecs(votingDelay as bigint | undefined)}</span></div>
        <div><span className="text-gray-500">Timelock:</span> <span className="text-white">{fmtSecs(timelockDelay as bigint | undefined)}</span></div>
        <div><span className="text-gray-500">Early Unlock Penalty:</span> <span className="text-white">30% (⅓ → UBI)</span></div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GovernancePage() {
  const { isConnected } = useAccount()

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <InfoBanner
          title="GoodDAO Governance"
          description="Lock G$ → get veG$ → vote on protocol changes. Longer locks = more voting power (Curve-style). 33% of all protocol fees fund UBI."
          storageKey="governance-info-banner"
        />
        <Link
          href="/governance/analytics"
          className="shrink-0 ml-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          📊 Analytics
        </Link>
      </div>

      {!isConnected ? (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400 text-lg mb-4">Connect your wallet to participate in governance</p>
          <ConnectButton />
        </div>
      ) : (
        <>
          <VeLockPanel />
          <ProposalsList />
        </>
      )}

      {/* Governance Info */}
      <GovernanceParams />
    </div>
  )
}
