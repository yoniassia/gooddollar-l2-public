/**
 * Example: Multi-Agent Swarm on GoodDollar L2
 *
 * Demonstrates how to orchestrate multiple AI agents working together:
 * - Traders execute positions based on signals
 * - Arbitrageurs detect mispricings across protocols
 * - Liquidators monitor unhealthy positions
 * - Oracle agents feed price data
 *
 * Every agent's transaction funds UBI for humans worldwide.
 *
 * Usage:
 *   npx ts-node examples/multi-agent-swarm.ts
 */
import {
  AgentSwarm,
  Strategies,
  PortfolioAggregator,
  type Signal,
} from '../src'
import { formatEther, parseEther } from 'viem'

async function main() {
  console.log('🐝 Initializing GoodDollar L2 Agent Swarm...\n')

  // ─── 1. Create swarm with role-based agents ───────────────────────────
  const swarm = Strategies.createDevnetSwarm({
    traders: 2,
    arbitrageurs: 1,
    liquidators: 1,
  })

  // Add a custom oracle agent
  swarm.addAgent({
    name: 'oracle-1',
    role: 'oracle',
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
    metadata: { feeds: ['ETH/USD', 'G$/USD'] },
  })

  console.log(`📊 Swarm size: ${swarm.size} agents`)
  swarm.getAgents().forEach(a => {
    console.log(`  ${a.role.padEnd(14)} ${a.name.padEnd(15)} ${a.address}`)
  })

  // ─── 2. Wire signal patterns ──────────────────────────────────────────
  Strategies.wireStandardSignals(swarm)

  // Custom: traders react to entry signals
  swarm.bus.on('entry-signal', async (signal: Signal) => {
    const { direction, marketId, confidence } = signal.data as any
    console.log(`\n📡 Signal: ${direction} market ${marketId} (confidence: ${confidence}%)`)

    const traders = swarm.getAgents('trader')
    for (const trader of traders) {
      console.log(`  → ${trader.name} received signal`)
      // In production: trader.sdk.perps.openLong/Short(...)
    }
  })

  // Custom: liquidators react to health alerts
  swarm.bus.on('low-health-factor', async (signal: Signal) => {
    const { user, healthFactor } = signal.data as any
    console.log(`\n⚠️ Low health factor: ${user} at ${healthFactor}`)

    const liquidators = swarm.getAgents('liquidator')
    for (const liq of liquidators) {
      console.log(`  → ${liq.name} evaluating liquidation opportunity`)
      // In production: check profitability, execute liquidation
    }
  })

  // ─── 3. Simulate oracle price broadcast ───────────────────────────────
  console.log('\n🔮 Oracle broadcasting prices...')
  await swarm.bus.emit({
    type: 'price-update',
    from: 'oracle-1',
    data: { pair: 'ETH/USD', price: 3500, source: 'pyth' },
  })

  // ─── 4. Simulate entry signal ─────────────────────────────────────────
  await swarm.bus.emit({
    type: 'entry-signal',
    from: 'oracle-1',
    data: { direction: 'long', marketId: 0, confidence: 85 },
  })

  // ─── 5. Simulate liquidation alert ────────────────────────────────────
  await swarm.bus.emit({
    type: 'low-health-factor',
    from: 'liquidator-1',
    data: { user: '0xDeaD...', healthFactor: 0.95 },
  })

  // ─── 6. Run parallel task across all traders ──────────────────────────
  console.log('\n🔄 Running parallel portfolio check across traders...')
  const results = await swarm.runParallel('trader', async (agent) => {
    const eth = await agent.sdk.getEthBalance()
    return { address: agent.address, eth: formatEther(eth) }
  })

  results.forEach(r => {
    if (r.result) {
      console.log(`  ${r.agent}: ${r.result.eth} ETH`)
    } else {
      console.log(`  ${r.agent}: ERROR — ${r.error?.message}`)
    }
  })

  // ─── 7. Portfolio aggregation ─────────────────────────────────────────
  console.log('\n💰 Swarm Portfolio:')
  const portfolio = new PortfolioAggregator(swarm)
  const summary = await portfolio.getBalanceSummary()
  summary.agents.forEach(a => {
    console.log(`  ${a.name.padEnd(15)} ETH: ${a.eth}`)
  })
  console.log(`  ${'TOTAL'.padEnd(15)} ETH: ${summary.totals.eth}`)

  // ─── 8. Signal history ────────────────────────────────────────────────
  console.log(`\n📜 Signal history: ${swarm.bus.signalCount} signals`)
  swarm.bus.getHistory().forEach(s => {
    console.log(`  [${new Date(s.timestamp).toISOString()}] ${s.type} from ${s.from}`)
  })

  console.log('\n✅ Swarm demo complete. Every agent transaction funds UBI! 🌍')
}

main().catch(console.error)
