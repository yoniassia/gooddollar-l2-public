/**
 * GoodDollar L2 Liquidation Bot
 *
 * Runs two liquidation engines in parallel:
 *   1. LendLiquidator — monitors GoodLendPool borrowers
 *   2. StableLiquidator — monitors GoodStable CDP vaults
 *
 * Both scan for undercollateralized positions and execute liquidations
 * on every polling cycle. 33% of all protocol fees (including liquidation
 * penalties) flow to the UBI pool.
 *
 * Usage:
 *   PRIVATE_KEY=<key> RPC_URL=http://localhost:8545 npm start
 */

import { LendLiquidator } from './lendLiquidator'
import { StableLiquidator } from './stableLiquidator'
import { CONFIG } from './config'

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  GoodDollar L2 — Liquidation Bot')
  console.log('═══════════════════════════════════════════════')
  console.log(`  RPC: ${CONFIG.rpcUrl}`)
  console.log(`  Poll interval: ${CONFIG.pollIntervalMs}ms`)
  console.log(`  GoodLend Pool: ${CONFIG.goodLendPool}`)
  console.log(`  VaultManager: ${CONFIG.vaultManager}`)
  console.log('')

  // Initialize both liquidators
  const lendLiquidator = new LendLiquidator()
  const stableLiquidator = new StableLiquidator()

  // Initial scan for existing positions
  console.log('[Boot] Scanning for existing borrowers and vaults...')
  await Promise.all([
    lendLiquidator.scanBorrowers(),
    stableLiquidator.loadIlks().then(() => stableLiquidator.scanVaults()),
  ])

  // Listen for new positions in real-time
  lendLiquidator.listenForNewBorrowers()
  stableLiquidator.listenForNewVaults()

  console.log('[Boot] ✅ Liquidator bot online — watching for underwater positions...\n')

  // Main polling loop
  let cycle = 0
  const poll = async () => {
    cycle++
    const timestamp = new Date().toISOString()

    try {
      const [lendLiqs, stableLiqs] = await Promise.all([
        lendLiquidator.checkAndLiquidate(),
        stableLiquidator.checkAndLiquidate(),
      ])

      if (lendLiqs > 0 || stableLiqs > 0) {
        console.log(
          `[Cycle ${cycle}] ${timestamp} — Liquidations: Lend=${lendLiqs}, Stable=${stableLiqs}`,
        )
      } else if (cycle % 60 === 0) {
        // Log heartbeat every ~5 minutes (at 5s interval)
        console.log(`[Cycle ${cycle}] ${timestamp} — All positions healthy ✓`)
      }
    } catch (err) {
      console.error(`[Cycle ${cycle}] ${timestamp} — Poll error:`, err)
    }
  }

  // Run immediately, then on interval
  await poll()
  setInterval(poll, CONFIG.pollIntervalMs)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
