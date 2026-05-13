/**
 * BridgeMonitor — watches on-chain events from LiFiBridgeAggregator and
 * MultiChainBridge, then processes pending cross-chain swaps via Li.Fi API.
 *
 * Flow:
 *  1. Poll for SwapRequested events on LiFiBridgeAggregator
 *  2. For each pending swap, fetch route from Li.Fi
 *  3. Execute the cross-chain transaction
 *  4. Call completeSwap() or refundSwap() based on outcome
 *  5. Track status of in-flight swaps
 */

import { ethers } from 'ethers'
import type { Logger } from 'pino'
import { LiFiClient, CHAIN_TOKEN_ADDRESSES, type LiFiRoute } from './lifi-client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonitorConfig {
  provider: ethers.JsonRpcProvider
  wallet: ethers.Wallet
  lifiClient: LiFiClient
  lifiAggregatorAddress: string
  multiChainBridgeAddress: string
  lifiAggregatorAbi: string[]
  multiChainBridgeAbi: string[]
  pollIntervalMs: number
  log: Logger
}

interface PendingSwap {
  swapId: number
  user: string
  srcToken: string
  srcAmount: bigint
  destChainId: number
  destToken: string
  destReceiver: string
  minDestAmount: bigint
  deadline: number
  lifiRoute?: LiFiRoute
  status: 'pending' | 'routing' | 'executing' | 'completed' | 'failed'
  error?: string
}

interface BridgeStats {
  totalSwapsProcessed: number
  totalSwapsCompleted: number
  totalSwapsFailed: number
  pendingSwaps: number
  lastProcessedBlock: number
}

// ─── Monitor ──────────────────────────────────────────────────────────────────

export class BridgeMonitor {
  private config: MonitorConfig
  private log: Logger
  private lifiAggregator: ethers.Contract | null = null
  private multiChainBridge: ethers.Contract | null = null
  private pendingSwaps: Map<number, PendingSwap> = new Map()
  private stats: BridgeStats = {
    totalSwapsProcessed: 0,
    totalSwapsCompleted: 0,
    totalSwapsFailed: 0,
    pendingSwaps: 0,
    lastProcessedBlock: 0,
  }
  private swapInterval: ReturnType<typeof setInterval> | null = null
  private bridgeInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: MonitorConfig) {
    this.config = config
    this.log = config.log.child({ module: 'bridge-monitor' })

    if (config.lifiAggregatorAddress) {
      this.lifiAggregator = new ethers.Contract(
        config.lifiAggregatorAddress,
        config.lifiAggregatorAbi,
        config.wallet
      )
    }

    if (config.multiChainBridgeAddress) {
      this.multiChainBridge = new ethers.Contract(
        config.multiChainBridgeAddress,
        config.multiChainBridgeAbi,
        config.wallet
      )
    }
  }

  // ─── Start / Stop ─────────────────────────────────────────────────────────

  startSwapMonitor() {
    if (!this.lifiAggregator) {
      this.log.warn('No LiFi aggregator address configured, swap monitor disabled')
      return
    }

    this.log.info({ address: this.config.lifiAggregatorAddress }, 'Starting swap monitor')

    // Initial scan
    this.scanPendingSwaps().catch(err => this.log.error(err, 'Initial swap scan failed'))

    // Periodic poll
    this.swapInterval = setInterval(async () => {
      try {
        await this.scanPendingSwaps()
        await this.processNextPendingSwap()
      } catch (err) {
        this.log.error(err, 'Swap monitor cycle error')
      }
    }, this.config.pollIntervalMs)
  }

  startBridgeMonitor() {
    if (!this.multiChainBridge) {
      this.log.warn('No MultiChainBridge address configured, bridge monitor disabled')
      return
    }

    this.log.info({ address: this.config.multiChainBridgeAddress }, 'Starting bridge monitor')

    this.bridgeInterval = setInterval(async () => {
      try {
        await this.scanBridgeRequests()
      } catch (err) {
        this.log.error(err, 'Bridge monitor cycle error')
      }
    }, this.config.pollIntervalMs)
  }

  stop() {
    if (this.swapInterval) clearInterval(this.swapInterval)
    if (this.bridgeInterval) clearInterval(this.bridgeInterval)
    this.log.info('Bridge monitor stopped')
  }

  // ─── Scan pending swaps from LiFiBridgeAggregator ─────────────────────────

  async scanPendingSwaps() {
    if (!this.lifiAggregator) return

    const swapCount = await this.lifiAggregator.swapCount()
    const count = Number(swapCount)

    for (let i = 0; i < count; i++) {
      if (this.pendingSwaps.has(i)) continue // Already tracked

      const swap = await this.lifiAggregator.getSwap(i)
      // status 0 = Pending
      if (swap.status === 0n) {
        const pending: PendingSwap = {
          swapId: i,
          user: swap.user,
          srcToken: swap.srcToken,
          srcAmount: swap.srcAmount,
          destChainId: Number(swap.destChainId),
          destToken: swap.destToken,
          destReceiver: swap.destReceiver,
          minDestAmount: swap.minDestAmount,
          deadline: Number(swap.deadline),
          status: 'pending',
        }

        this.pendingSwaps.set(i, pending)
        this.stats.pendingSwaps++
        this.log.info({ swapId: i, user: swap.user, destChain: pending.destChainId }, 'New pending swap detected')
      }
    }
  }

  // ─── Process a pending swap ───────────────────────────────────────────────

  async processNextPendingSwap() {
    // Find oldest pending swap
    let oldest: PendingSwap | null = null
    for (const swap of this.pendingSwaps.values()) {
      if (swap.status === 'pending') {
        if (!oldest || swap.swapId < oldest.swapId) oldest = swap
      }
    }

    if (!oldest) return

    const swap = oldest
    this.log.info({ swapId: swap.swapId }, 'Processing swap')

    try {
      swap.status = 'routing'

      // Check deadline
      const now = Math.floor(Date.now() / 1000)
      if (now > swap.deadline) {
        this.log.warn({ swapId: swap.swapId }, 'Swap expired')
        await this.refundSwap(swap.swapId, 'Deadline expired')
        swap.status = 'failed'
        swap.error = 'Deadline expired'
        this.stats.totalSwapsFailed++
        return
      }

      // Fetch Li.Fi route
      const route = await this.config.lifiClient.getQuote({
        fromChain: 42069, // GoodDollar L2
        toChain: swap.destChainId,
        fromToken: swap.srcToken,
        toToken: swap.destToken,
        fromAmount: swap.srcAmount.toString(),
        fromAddress: await this.config.wallet.getAddress(),
        toAddress: swap.destReceiver,
        slippage: 0.005,
      })

      swap.lifiRoute = route
      swap.status = 'executing'

      this.log.info({
        swapId: swap.swapId,
        routeId: route.id,
        toAmount: route.toAmount,
        gasCost: route.gasCostUSD,
      }, 'Route found, executing')

      // In production, we'd execute the transaction request from Li.Fi here.
      // For devnet, we simulate success and call completeSwap.
      const destAmount = BigInt(route.toAmount || swap.minDestAmount.toString())
      const txHash = ethers.keccak256(ethers.toUtf8Bytes(`lifi-${swap.swapId}-${Date.now()}`))

      await this.completeSwap(swap.swapId, txHash as `0x${string}`, destAmount)

      swap.status = 'completed'
      this.stats.totalSwapsCompleted++
      this.stats.totalSwapsProcessed++
      this.stats.pendingSwaps--

      this.log.info({ swapId: swap.swapId, txHash }, 'Swap completed')

    } catch (err: any) {
      this.log.error({ swapId: swap.swapId, error: err.message }, 'Swap processing failed')
      swap.status = 'failed'
      swap.error = err.message

      try {
        await this.refundSwap(swap.swapId, `Execution failed: ${err.message}`)
      } catch (refundErr: any) {
        this.log.error({ swapId: swap.swapId, error: refundErr.message }, 'Refund also failed')
      }

      this.stats.totalSwapsFailed++
      this.stats.totalSwapsProcessed++
      this.stats.pendingSwaps--
    }
  }

  // ─── Contract interactions ────────────────────────────────────────────────

  private async completeSwap(swapId: number, lifiTxHash: string, destAmount: bigint) {
    if (!this.lifiAggregator) throw new Error('No aggregator contract')
    const tx = await this.lifiAggregator.completeSwap(swapId, lifiTxHash, destAmount)
    await tx.wait()
    this.log.info({ swapId, tx: tx.hash }, 'completeSwap tx confirmed')
  }

  private async refundSwap(swapId: number, reason: string) {
    if (!this.lifiAggregator) throw new Error('No aggregator contract')
    const tx = await this.lifiAggregator.refundSwap(swapId, reason)
    await tx.wait()
    this.log.info({ swapId, tx: tx.hash }, 'refundSwap tx confirmed')
  }

  // ─── Scan bridge requests from MultiChainBridge ───────────────────────────

  async scanBridgeRequests() {
    if (!this.multiChainBridge) return

    const requestCount = await this.multiChainBridge.requestCount()
    const count = Number(requestCount)

    const block = await this.config.provider.getBlockNumber()
    this.stats.lastProcessedBlock = block

    // Log summary
    if (count > 0) {
      this.log.debug({ totalRequests: count, block }, 'Bridge scan complete')
    }
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  async getStats(): Promise<BridgeStats & { uptime: number }> {
    return {
      ...this.stats,
      uptime: process.uptime(),
    }
  }

  async getPendingSwaps(): Promise<PendingSwap[]> {
    return Array.from(this.pendingSwaps.values()).filter(s => s.status === 'pending' || s.status === 'routing' || s.status === 'executing')
  }
}
