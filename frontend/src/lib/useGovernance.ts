'use client'

import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther, type Address } from 'viem'
import { CONTRACTS } from './devnet'
import { VoteEscrowedGDABI, GoodDAOABI, GoodDollarTokenABI } from './abi'

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPOSAL_STATES = [
  'Pending', 'Active', 'Canceled', 'Defeated',
  'Succeeded', 'Queued', 'Executed', 'Expired',
] as const

export type ProposalState = typeof PROPOSAL_STATES[number]

export function proposalStateName(stateNum: number): ProposalState {
  return PROPOSAL_STATES[stateNum] ?? 'Pending'
}

export function proposalStateColor(state: ProposalState): string {
  switch (state) {
    case 'Active': return 'text-blue-400'
    case 'Succeeded': case 'Queued': return 'text-green-400'
    case 'Executed': return 'text-emerald-400'
    case 'Defeated': case 'Canceled': case 'Expired': return 'text-red-400'
    default: return 'text-yellow-400'
  }
}

export function proposalStateBg(state: ProposalState): string {
  switch (state) {
    case 'Active': return 'bg-blue-500/20 border-blue-500/40'
    case 'Succeeded': case 'Queued': return 'bg-green-500/20 border-green-500/40'
    case 'Executed': return 'bg-emerald-500/20 border-emerald-500/40'
    case 'Defeated': case 'Canceled': case 'Expired': return 'bg-red-500/20 border-red-500/40'
    default: return 'bg-yellow-500/20 border-yellow-500/40'
  }
}

// ── veG$ Hooks ────────────────────────────────────────────────────────────────

export function useVeGDLock(address?: Address) {
  return useReadContract({
    address: CONTRACTS.VoteEscrowedGD,
    abi: VoteEscrowedGDABI,
    functionName: 'locks',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
}

export function useVotingPower(address?: Address) {
  return useReadContract({
    address: CONTRACTS.VoteEscrowedGD,
    abi: VoteEscrowedGDABI,
    functionName: 'votingPowerOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
}

export function useDelegatedVotes(address?: Address) {
  return useReadContract({
    address: CONTRACTS.VoteEscrowedGD,
    abi: VoteEscrowedGDABI,
    functionName: 'getVotes',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
}

export function useTotalVotingPower() {
  return useReadContract({
    address: CONTRACTS.VoteEscrowedGD,
    abi: VoteEscrowedGDABI,
    functionName: 'totalVotingPower',
  })
}

export function useTotalLocked() {
  return useReadContract({
    address: CONTRACTS.VoteEscrowedGD,
    abi: VoteEscrowedGDABI,
    functionName: 'totalLocked',
  })
}

export function useGDBalance(address?: Address) {
  return useReadContract({
    address: CONTRACTS.GoodDollarToken,
    abi: GoodDollarTokenABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
}

export function useGDAllowance(address?: Address) {
  return useReadContract({
    address: CONTRACTS.GoodDollarToken,
    abi: GoodDollarTokenABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.VoteEscrowedGD] : undefined,
    query: { enabled: !!address },
  })
}

// ── veG$ Write Hooks ──────────────────────────────────────────────────────────

export function useApproveGD() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function approve(amount: bigint) {
    writeContract({
      address: CONTRACTS.GoodDollarToken,
      abi: GoodDollarTokenABI,
      functionName: 'approve',
      args: [CONTRACTS.VoteEscrowedGD, amount],
    })
  }

  return { approve, hash, isPending, isConfirming, isSuccess }
}

export function useLockGD() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function lock(amount: bigint, durationSeconds: bigint) {
    writeContract({
      address: CONTRACTS.VoteEscrowedGD,
      abi: VoteEscrowedGDABI,
      functionName: 'lock',
      args: [amount, durationSeconds],
    })
  }

  return { lock, hash, isPending, isConfirming, isSuccess }
}

export function useWithdrawGD() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function withdraw() {
    writeContract({
      address: CONTRACTS.VoteEscrowedGD,
      abi: VoteEscrowedGDABI,
      functionName: 'withdraw',
    })
  }

  return { withdraw, hash, isPending, isConfirming, isSuccess }
}

export function useEarlyUnlock() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function earlyUnlock() {
    writeContract({
      address: CONTRACTS.VoteEscrowedGD,
      abi: VoteEscrowedGDABI,
      functionName: 'earlyUnlock',
    })
  }

  return { earlyUnlock, hash, isPending, isConfirming, isSuccess }
}

export function useDelegateVotes() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function delegate(to: Address) {
    writeContract({
      address: CONTRACTS.VoteEscrowedGD,
      abi: VoteEscrowedGDABI,
      functionName: 'delegate',
      args: [to],
    })
  }

  return { delegate, hash, isPending, isConfirming, isSuccess }
}

// ── GoodDAO Params Hooks ──────────────────────────────────────────────────────

export function useVotingDelay() {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'VOTING_DELAY',
  })
}

export function useVotingPeriod() {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'VOTING_PERIOD',
  })
}

export function useTimelockDelay() {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'TIMELOCK_DELAY',
  })
}

export function useProposalThresholdBps() {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'PROPOSAL_THRESHOLD_BPS',
  })
}

export function useQuorumBps() {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'QUORUM_BPS',
  })
}

// ── GoodDAO Read Hooks ────────────────────────────────────────────────────────

export function useProposalCount() {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'proposalCount',
  })
}

export function useProposal(id: number) {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'proposals',
    args: [BigInt(id)],
    query: { enabled: id > 0 },
  })
}

export function useProposalState(id: number) {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'state',
    args: [BigInt(id)],
    query: { enabled: id > 0 },
  })
}

export function useVoteReceipt(proposalId: number, voter?: Address) {
  return useReadContract({
    address: CONTRACTS.GoodDAO,
    abi: GoodDAOABI,
    functionName: 'receipts',
    args: voter ? [BigInt(proposalId), voter] : undefined,
    query: { enabled: proposalId > 0 && !!voter },
  })
}

// ── GoodDAO Write Hooks ───────────────────────────────────────────────────────

export function useCastVote() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function castVote(proposalId: number, support: 0 | 1 | 2) {
    writeContract({
      address: CONTRACTS.GoodDAO,
      abi: GoodDAOABI,
      functionName: 'castVote',
      args: [BigInt(proposalId), support],
    })
  }

  return { castVote, hash, isPending, isConfirming, isSuccess }
}

export function useQueueProposal() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function queue(proposalId: number) {
    writeContract({
      address: CONTRACTS.GoodDAO,
      abi: GoodDAOABI,
      functionName: 'queue',
      args: [BigInt(proposalId)],
    })
  }

  return { queue, hash, isPending, isConfirming, isSuccess }
}

export function useExecuteProposal() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function execute(proposalId: number) {
    writeContract({
      address: CONTRACTS.GoodDAO,
      abi: GoodDAOABI,
      functionName: 'execute',
      args: [BigInt(proposalId)],
    })
  }

  return { execute, hash, isPending, isConfirming, isSuccess }
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  if (seconds < 86400 * 30) return `${Math.round(seconds / 86400)}d`
  if (seconds < 86400 * 365) return `${(seconds / (86400 * 30)).toFixed(1)}mo`
  return `${(seconds / (86400 * 365)).toFixed(1)}y`
}

export function formatVotes(votes: bigint): string {
  const num = Number(formatEther(votes))
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toFixed(0)
}
