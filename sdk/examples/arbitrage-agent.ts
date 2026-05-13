/**
 * Example: Arbitrage Agent for GoodDollar L2
 *
 * Monitors prediction markets for mispriced outcomes and executes
 * arbitrage when the combined YES+NO price deviates from $1.
 *
 * Also monitors lending rates across assets for supply/borrow arbitrage.
 *
 * Usage:
 *   AGENT_KEY=0x... npx ts-node examples/arbitrage-agent.ts
 */
import { GoodDollarSDK, ADDRESSES } from '../src'
import { formatEther, type Address } from 'viem'

const POLL_INTERVAL = 5_000 // 5 seconds

async function main() {
  const key = process.env.AGENT_KEY as `0x${string}` | undefined
  if (!key) {
    console.error('Set AGENT_KEY=0x...')
    process.exit(1)
  }

  const sdk = new GoodDollarSDK({ privateKey: key })
  console.log(`🔍 Arbitrage agent: ${sdk.address}`)

  // ─── Prediction Market Arbitrage ──────────────────────────────────────
  async function checkPredictArb() {
    const count = await sdk.predict.getMarketCount()
    const opportunities: Array<{ id: bigint; question: string; deviation: number }> = []

    for (let i = 0n; i < count; i++) {
      const market = await sdk.predict.getMarket(i)
      if (market.status !== 0) continue // skip non-active

      const total = market.totalYES + market.totalNO
      if (total === 0n) continue

      // Implied combined cost of YES + NO should = collateral
      // Deviation from this = arbitrage opportunity
      const yesProb = await sdk.predict.getYesProbability(i)
      const noProb = 10000n - yesProb

      // If combined < 10000 bps, buy both sides (positive arb)
      // If combined > 10000 bps, sell both sides (negative arb)
      const combined = Number(yesProb) + Number(noProb)
      const deviation = Math.abs(combined - 10000) / 100

      if (deviation > 2) { // >2% mispricing
        opportunities.push({
          id: i,
          question: market.question.slice(0, 50),
          deviation,
        })
      }
    }

    return opportunities
  }

  // ─── Lending Rate Monitor ─────────────────────────────────────────────
  async function checkLendingRates() {
    const assets = [
      { name: 'G$', addr: ADDRESSES.GoodDollarToken },
      { name: 'USDC', addr: ADDRESSES.MockUSDC },
      { name: 'WETH', addr: ADDRESSES.MockWETH },
    ]

    const rates: Array<{ name: string; supplyRate: bigint; borrowRate: bigint; spread: bigint }> = []

    for (const asset of assets) {
      try {
        const data = await sdk.lend.getReserveData(asset.addr as Address)
        rates.push({
          name: asset.name,
          supplyRate: data.supplyRate,
          borrowRate: data.borrowRate,
          spread: data.borrowRate - data.supplyRate,
        })
      } catch {
        // Reserve might not exist
      }
    }

    return rates
  }

  // ─── Single scan ──────────────────────────────────────────────────────
  console.log('\n🎯 Scanning prediction markets...')
  const arbs = await checkPredictArb()
  if (arbs.length > 0) {
    console.log('  Opportunities found:')
    arbs.forEach(a => console.log(`    Market ${a.id}: "${a.question}" — ${a.deviation}% mispriced`))
  } else {
    console.log('  No mispriced markets detected')
  }

  console.log('\n🏦 Scanning lending rates...')
  const rates = await checkLendingRates()
  rates.forEach(r => {
    console.log(`  ${r.name}: supply=${formatEther(r.supplyRate)}% borrow=${formatEther(r.borrowRate)}% spread=${formatEther(r.spread)}%`)
  })

  console.log('\n✅ Scan complete. Deploy as a cron job for continuous monitoring.')
}

main().catch(console.error)
