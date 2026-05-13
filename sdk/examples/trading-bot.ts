/**
 * Example: AI Trading Agent for GoodDollar L2
 *
 * This bot demonstrates how an AI agent can:
 * 1. Check balances and market state
 * 2. Open perp positions based on simple logic
 * 3. Trade prediction markets
 * 4. Supply to lending pools
 * 5. Mint synthetic stocks
 *
 * Every trade funds UBI — 33% of fees go to the GoodDollar UBI pool.
 *
 * Usage:
 *   AGENT_KEY=0x... npx ts-node examples/trading-bot.ts
 */
import { GoodDollarSDK, ADDRESSES } from '../src'
import { parseEther, formatEther, type Address } from 'viem'

async function main() {
  const key = process.env.AGENT_KEY as `0x${string}` | undefined
  if (!key) {
    console.error('Set AGENT_KEY=0x... (Anvil private key)')
    process.exit(1)
  }

  const sdk = new GoodDollarSDK({ privateKey: key })
  console.log(`🤖 Agent address: ${sdk.address}`)

  // ─── 1. Portfolio Overview ────────────────────────────────────────────
  console.log('\n📊 Portfolio:')
  const eth = await sdk.getEthBalance()
  const gd = await sdk.getBalance('GoodDollarToken')
  const usdc = await sdk.getBalance('MockUSDC')
  console.log(`  ETH:  ${formatEther(eth)}`)
  console.log(`  G$:   ${formatEther(gd)}`)
  console.log(`  USDC: ${formatEther(usdc)}`)

  // ─── 2. Perps: Check markets ─────────────────────────────────────────
  console.log('\n📈 Perpetual Markets:')
  const perpCount = await sdk.perps.getMarketCount()
  console.log(`  ${perpCount} markets available`)

  if (perpCount > 0n) {
    const margin = await sdk.perps.getMarginBalance()
    console.log(`  Margin balance: ${formatEther(margin)}`)

    const pos = await sdk.perps.getPosition(0n)
    console.log(`  Market 0 position: size=${pos.size}, isLong=${pos.isLong}`)
  }

  // ─── 3. Prediction Markets ───────────────────────────────────────────
  console.log('\n🎯 Prediction Markets:')
  const marketCount = await sdk.predict.getMarketCount()
  console.log(`  ${marketCount} markets active`)

  for (let i = 0n; i < BigInt(Math.min(Number(marketCount), 3)); i++) {
    const m = await sdk.predict.getMarket(i)
    const prob = await sdk.predict.getYesProbability(i)
    console.log(`  [${i}] "${m.question.slice(0, 50)}..." → YES ${Number(prob) / 100}%`)
  }

  // ─── 4. Lending ──────────────────────────────────────────────────────
  console.log('\n🏦 Lending:')
  const account = await sdk.lend.getAccountData()
  console.log(`  Health factor: ${formatEther(account.healthFactor)}`)
  console.log(`  Collateral: $${formatEther(account.totalCollateralUSD)}`)
  console.log(`  Debt: $${formatEther(account.totalDebtUSD)}`)

  // ─── 5. Synthetic Stocks ─────────────────────────────────────────────
  console.log('\n📉 Synthetic Stocks:')
  const tickers = await sdk.stocks.listTickers()
  console.log(`  Available: ${tickers.join(', ')}`)

  for (const t of tickers.slice(0, 3)) {
    const pos = await sdk.stocks.getPosition(t)
    if (pos.debt > 0n) {
      console.log(`  ${t}: collateral=${formatEther(pos.collateral)}, debt=${formatEther(pos.debt)}, ratio=${pos.ratio}%`)
    }
  }

  // ─── 6. UBI Impact ───────────────────────────────────────────────────
  console.log('\n💚 UBI Impact:')
  const ubiFees = await sdk.ubi.getTotalFees(ADDRESSES.GoodDollarToken as Address)
  const totalSwaps = await sdk.ubi.getTotalSwaps()
  console.log(`  Total UBI fees collected: ${formatEther(ubiFees)} G$`)
  console.log(`  Total swaps processed: ${totalSwaps}`)
  console.log(`  Every trade you make funds Universal Basic Income! 🌍`)

  console.log('\n✅ Agent ready. Every transaction funds UBI for humans worldwide.')
}

main().catch(console.error)
