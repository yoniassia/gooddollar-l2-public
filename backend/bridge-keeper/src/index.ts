/**
 * GoodDollar Bridge Keeper
 *
 * Watches the LiFiBridgeAggregator + MultiChainBridge contracts for
 * SwapRequested / BridgeInitiated events, then:
 *   1. Fetches the best route from Li.Fi REST API
 *   2. Executes the cross-chain swap via Li.Fi
 *   3. Calls completeSwap() on the aggregator contract to finalize
 *
 * Also monitors pending fast withdrawals and matches them with LPs.
 */

import { ethers } from 'ethers'
import express from 'express'
import pino from 'pino'
import dotenv from 'dotenv'
import { LiFiClient, type LiFiRoute } from './lifi-client'
import { BridgeMonitor } from './bridge-monitor'

dotenv.config()

const log = pino({ level: process.env.LOG_LEVEL || 'info' })

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545'
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const LIFI_AGGREGATOR_ADDRESS = process.env.LIFI_AGGREGATOR_ADDRESS || ''
const MULTI_CHAIN_BRIDGE_ADDRESS = process.env.MULTI_CHAIN_BRIDGE_ADDRESS || ''
const PORT = parseInt(process.env.PORT || '3006')
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000')

// ─── ABI fragments ───────────────────────────────────────────────────────────

const LIFI_AGGREGATOR_ABI = [
  'event SwapRequested(uint256 indexed swapId, address indexed user, address srcToken, uint256 srcAmount, uint256 destChainId, address destToken, address destReceiver, uint256 minDestAmount, uint256 deadline)',
  'event SwapCompleted(uint256 indexed swapId, bytes32 lifiTxHash, uint256 destAmount)',
  'event SwapRefunded(uint256 indexed swapId, string reason)',
  'function completeSwap(uint256 swapId, bytes32 lifiTxHash, uint256 destAmount)',
  'function refundSwap(uint256 swapId, string reason)',
  'function getSwap(uint256 swapId) view returns (tuple(address user, address srcToken, uint256 srcAmount, uint256 destChainId, address destToken, address destReceiver, uint256 minDestAmount, uint256 deadline, uint8 status, bytes32 lifiTxHash))',
  'function swapCount() view returns (uint256)',
]

const MULTI_CHAIN_BRIDGE_ABI = [
  'event BridgeInitiated(uint256 indexed requestId, address indexed user, address srcToken, uint256 amount, uint256 destChainId, address destToken, uint8 routeType)',
  'event BridgeCompleted(uint256 indexed requestId)',
  'function getRequest(uint256 requestId) view returns (tuple(address user, address srcToken, uint256 amount, uint256 destChainId, address destToken, address destReceiver, uint8 routeType, uint256 timestamp, bool completed))',
  'function requestCount() view returns (uint256)',
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const network = await provider.getNetwork()

  log.info({ chainId: network.chainId.toString(), rpc: RPC_URL }, 'Bridge keeper starting')

  const lifiClient = new LiFiClient(log)
  const monitor = new BridgeMonitor({
    provider,
    wallet,
    lifiClient,
    lifiAggregatorAddress: LIFI_AGGREGATOR_ADDRESS,
    multiChainBridgeAddress: MULTI_CHAIN_BRIDGE_ADDRESS,
    lifiAggregatorAbi: LIFI_AGGREGATOR_ABI,
    multiChainBridgeAbi: MULTI_CHAIN_BRIDGE_ABI,
    pollIntervalMs: POLL_INTERVAL_MS,
    log,
  })

  // Start monitoring
  if (LIFI_AGGREGATOR_ADDRESS) {
    monitor.startSwapMonitor()
  }
  if (MULTI_CHAIN_BRIDGE_ADDRESS) {
    monitor.startBridgeMonitor()
  }

  // Health / status API
  const app = express()
  app.get('/health', (_req, res) => res.json({ status: 'ok', chainId: network.chainId.toString() }))

  app.get('/stats', async (_req, res) => {
    const stats = await monitor.getStats()
    res.json(stats)
  })

  app.get('/pending', async (_req, res) => {
    const pending = await monitor.getPendingSwaps()
    res.json(pending)
  })

  app.listen(PORT, () => {
    log.info({ port: PORT }, 'Bridge keeper API listening')
  })
}

main().catch(err => {
  console.error('Bridge keeper failed to start:', err)
  process.exit(1)
})
