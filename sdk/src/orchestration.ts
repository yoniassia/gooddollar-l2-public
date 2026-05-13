/**
 * Multi-Agent Orchestration Helpers for GoodDollar L2
 *
 * Enables AI agent swarms to coordinate trading, lending, market-making,
 * and arbitrage — all while funding UBI.
 *
 * Key concepts:
 * - AgentRole: predefined strategies (trader, arbitrageur, liquidator, market-maker)
 * - AgentSwarm: coordinate multiple agents with shared state
 * - SignalBus: pub/sub message passing between agents
 * - PortfolioAggregator: unified view across all agent wallets
 */
import { type Address, formatEther, parseEther } from 'viem'
import { GoodDollarSDK, type GoodDollarSDKConfig } from './client'
import { ADDRESSES } from './addresses'

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentRole = 'trader' | 'arbitrageur' | 'liquidator' | 'market-maker' | 'oracle' | 'custom'

export interface AgentConfig {
  /** Unique name for this agent */
  name: string
  /** Agent's role/strategy */
  role: AgentRole
  /** Private key for signing transactions */
  privateKey: `0x${string}`
  /** RPC URL override (optional) */
  rpcUrl?: string
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

export interface Signal {
  /** Signal type identifier */
  type: string
  /** Sender agent name */
  from: string
  /** Signal payload */
  data: Record<string, unknown>
  /** Timestamp */
  timestamp: number
}

export type SignalHandler = (signal: Signal) => void | Promise<void>

export interface AgentState {
  name: string
  role: AgentRole
  address: Address
  balances: {
    eth: bigint
    gd: bigint
    usdc: bigint
  }
  lastActive: number
  metadata: Record<string, unknown>
}

export interface SwarmSnapshot {
  agents: AgentState[]
  totalEth: bigint
  totalGd: bigint
  totalUsdc: bigint
  signalCount: number
  timestamp: number
}

// ─── Signal Bus ─────────────────────────────────────────────────────────────

/**
 * In-process pub/sub for agent-to-agent communication.
 *
 * Usage:
 *   const bus = new SignalBus()
 *   bus.on('price-alert', async (signal) => { ... })
 *   bus.emit({ type: 'price-alert', from: 'oracle', data: { price: 3000 } })
 */
export class SignalBus {
  private handlers: Map<string, SignalHandler[]> = new Map()
  private history: Signal[] = []
  private maxHistory: number

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory
  }

  /** Subscribe to a signal type */
  on(type: string, handler: SignalHandler): () => void {
    const handlers = this.handlers.get(type) ?? []
    handlers.push(handler)
    this.handlers.set(type, handlers)
    // Return unsubscribe function
    return () => {
      const idx = handlers.indexOf(handler)
      if (idx >= 0) handlers.splice(idx, 1)
    }
  }

  /** Subscribe to all signals */
  onAny(handler: SignalHandler): () => void {
    return this.on('*', handler)
  }

  /** Emit a signal to all matching subscribers */
  async emit(signal: Omit<Signal, 'timestamp'>): Promise<void> {
    const fullSignal: Signal = { ...signal, timestamp: Date.now() }
    this.history.push(fullSignal)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory)
    }

    const handlers = [
      ...(this.handlers.get(signal.type) ?? []),
      ...(this.handlers.get('*') ?? []),
    ]
    await Promise.all(handlers.map(h => h(fullSignal)))
  }

  /** Get signal history, optionally filtered by type */
  getHistory(type?: string, limit = 50): Signal[] {
    const filtered = type ? this.history.filter(s => s.type === type) : this.history
    return filtered.slice(-limit)
  }

  /** Total signals emitted */
  get signalCount(): number {
    return this.history.length
  }

  /** Clear all handlers and history */
  reset(): void {
    this.handlers.clear()
    this.history = []
  }
}

// ─── Managed Agent ──────────────────────────────────────────────────────────

/**
 * A managed agent wraps a GoodDollarSDK instance with orchestration metadata.
 */
export class ManagedAgent {
  public readonly sdk: GoodDollarSDK
  public readonly name: string
  public readonly role: AgentRole
  public readonly metadata: Record<string, unknown>
  private _lastActive: number

  constructor(config: AgentConfig) {
    this.name = config.name
    this.role = config.role
    this.metadata = config.metadata ?? {}
    this._lastActive = Date.now()
    this.sdk = new GoodDollarSDK({
      privateKey: config.privateKey,
      rpcUrl: config.rpcUrl,
    })
  }

  get address(): Address {
    return this.sdk.address
  }

  get lastActive(): number {
    return this._lastActive
  }

  touch(): void {
    this._lastActive = Date.now()
  }

  /** Get full agent state including on-chain balances */
  async getState(): Promise<AgentState> {
    const [eth, gd, usdc] = await Promise.all([
      this.sdk.getEthBalance(),
      this.sdk.getBalance('GoodDollarToken'),
      this.sdk.getBalance('MockUSDC'),
    ])
    this.touch()
    return {
      name: this.name,
      role: this.role,
      address: this.address,
      balances: { eth, gd, usdc },
      lastActive: this._lastActive,
      metadata: this.metadata,
    }
  }
}

// ─── Agent Swarm ────────────────────────────────────────────────────────────

/**
 * Coordinate multiple AI agents operating on GoodDollar L2.
 *
 * Usage:
 *   const swarm = new AgentSwarm()
 *   swarm.addAgent({ name: 'trader-1', role: 'trader', privateKey: '0x...' })
 *   swarm.addAgent({ name: 'arb-1', role: 'arbitrageur', privateKey: '0x...' })
 *
 *   // Agents can signal each other
 *   swarm.bus.on('opportunity', async (signal) => {
 *     const trader = swarm.getAgent('trader-1')
 *     // execute trade...
 *   })
 *
 *   // Get unified portfolio view
 *   const snapshot = await swarm.snapshot()
 */
export class AgentSwarm {
  private agents: Map<string, ManagedAgent> = new Map()
  public readonly bus: SignalBus

  constructor(busHistorySize = 1000) {
    this.bus = new SignalBus(busHistorySize)
  }

  /** Add an agent to the swarm */
  addAgent(config: AgentConfig): ManagedAgent {
    if (this.agents.has(config.name)) {
      throw new Error(`Agent "${config.name}" already exists in swarm`)
    }
    const agent = new ManagedAgent(config)
    this.agents.set(config.name, agent)
    return agent
  }

  /** Remove an agent from the swarm */
  removeAgent(name: string): boolean {
    return this.agents.delete(name)
  }

  /** Get a specific agent */
  getAgent(name: string): ManagedAgent {
    const agent = this.agents.get(name)
    if (!agent) throw new Error(`Agent "${name}" not found`)
    return agent
  }

  /** Get all agents, optionally filtered by role */
  getAgents(role?: AgentRole): ManagedAgent[] {
    const all = Array.from(this.agents.values())
    return role ? all.filter(a => a.role === role) : all
  }

  /** Number of agents in the swarm */
  get size(): number {
    return this.agents.size
  }

  /** Get a unified snapshot of all agents' states */
  async snapshot(): Promise<SwarmSnapshot> {
    const states = await Promise.all(
      Array.from(this.agents.values()).map(a => a.getState())
    )

    const totals = states.reduce(
      (acc, s) => ({
        eth: acc.eth + s.balances.eth,
        gd: acc.gd + s.balances.gd,
        usdc: acc.usdc + s.balances.usdc,
      }),
      { eth: 0n, gd: 0n, usdc: 0n }
    )

    return {
      agents: states,
      totalEth: totals.eth,
      totalGd: totals.gd,
      totalUsdc: totals.usdc,
      signalCount: this.bus.signalCount,
      timestamp: Date.now(),
    }
  }

  /** Broadcast a signal from the swarm coordinator */
  async broadcast(type: string, data: Record<string, unknown>): Promise<void> {
    await this.bus.emit({ type, from: '_swarm', data })
  }

  /** Run a task across all agents of a given role in parallel */
  async runParallel<T>(
    role: AgentRole,
    task: (agent: ManagedAgent) => Promise<T>
  ): Promise<Array<{ agent: string; result?: T; error?: Error }>> {
    const agents = this.getAgents(role)
    return Promise.all(
      agents.map(async (agent) => {
        try {
          const result = await task(agent)
          agent.touch()
          return { agent: agent.name, result }
        } catch (error) {
          return { agent: agent.name, error: error as Error }
        }
      })
    )
  }

  /** Run a task sequentially across agents (for order-dependent operations) */
  async runSequential<T>(
    agents: string[],
    task: (agent: ManagedAgent) => Promise<T>
  ): Promise<Array<{ agent: string; result?: T; error?: Error }>> {
    const results: Array<{ agent: string; result?: T; error?: Error }> = []
    for (const name of agents) {
      const agent = this.getAgent(name)
      try {
        const result = await task(agent)
        agent.touch()
        results.push({ agent: name, result })
      } catch (error) {
        results.push({ agent: name, error: error as Error })
      }
    }
    return results
  }

  /** Reset the swarm (remove all agents, clear signal bus) */
  reset(): void {
    this.agents.clear()
    this.bus.reset()
  }
}

// ─── Portfolio Aggregator ───────────────────────────────────────────────────

export interface ProtocolExposure {
  perpPositions: Array<{ agent: string; marketId: bigint; size: bigint; isLong: boolean }>
  lendingDeposits: Array<{ agent: string; asset: string; collateral: bigint; debt: bigint }>
  predictPositions: Array<{ agent: string; marketId: bigint; question: string }>
  stockPositions: Array<{ agent: string; ticker: string; collateral: bigint; debt: bigint }>
}

/**
 * Aggregates portfolio data across an entire agent swarm.
 */
export class PortfolioAggregator {
  constructor(private swarm: AgentSwarm) {}

  /** Get combined balance summary */
  async getBalanceSummary(): Promise<{
    agents: Array<{ name: string; address: Address; eth: string; gd: string; usdc: string }>
    totals: { eth: string; gd: string; usdc: string }
  }> {
    const snap = await this.swarm.snapshot()
    return {
      agents: snap.agents.map(a => ({
        name: a.name,
        address: a.address,
        eth: formatEther(a.balances.eth),
        gd: formatEther(a.balances.gd),
        usdc: formatEther(a.balances.usdc),
      })),
      totals: {
        eth: formatEther(snap.totalEth),
        gd: formatEther(snap.totalGd),
        usdc: formatEther(snap.totalUsdc),
      },
    }
  }

  /** Scan all agents for protocol positions */
  async getProtocolExposure(): Promise<ProtocolExposure> {
    const exposure: ProtocolExposure = {
      perpPositions: [],
      lendingDeposits: [],
      predictPositions: [],
      stockPositions: [],
    }

    const agents = this.swarm.getAgents()

    for (const agent of agents) {
      const sdk = agent.sdk

      // Perps positions
      try {
        const perpCount = await sdk.perps.getMarketCount()
        for (let i = 0n; i < perpCount; i++) {
          const pos = await sdk.perps.getPosition(i)
          if (pos.size > 0n) {
            exposure.perpPositions.push({
              agent: agent.name,
              marketId: i,
              size: pos.size,
              isLong: pos.isLong,
            })
          }
        }
      } catch { /* no perps access */ }

      // Lending
      try {
        const accountData = await sdk.lend.getAccountData()
        if (accountData.totalCollateralUSD > 0n || accountData.totalDebtUSD > 0n) {
          exposure.lendingDeposits.push({
            agent: agent.name,
            asset: 'aggregate',
            collateral: accountData.totalCollateralUSD,
            debt: accountData.totalDebtUSD,
          })
        }
      } catch { /* no lending access */ }

      // Prediction markets
      try {
        const marketCount = await sdk.predict.getMarketCount()
        for (let i = 0n; i < BigInt(Math.min(Number(marketCount), 10)); i++) {
          const market = await sdk.predict.getMarket(i)
          if (market.status === 0 && market.totalYES + market.totalNO > 0n) {
            exposure.predictPositions.push({
              agent: agent.name,
              marketId: i,
              question: market.question,
            })
          }
        }
      } catch { /* no predict access */ }

      // Stocks
      try {
        const tickers = await sdk.stocks.listTickers()
        for (const ticker of tickers) {
          const pos = await sdk.stocks.getPosition(ticker)
          if (pos.debt > 0n) {
            exposure.stockPositions.push({
              agent: agent.name,
              ticker,
              collateral: pos.collateral,
              debt: pos.debt,
            })
          }
        }
      } catch { /* no stocks access */ }
    }

    return exposure
  }
}

// ─── Strategy Helpers ───────────────────────────────────────────────────────

/**
 * Pre-built strategy patterns for common agent coordination scenarios.
 */
export const Strategies = {
  /**
   * Create a standard trading swarm with role-based agents.
   * Uses Anvil's deterministic test keys for devnet.
   */
  createDevnetSwarm(config?: {
    rpcUrl?: string
    traders?: number
    arbitrageurs?: number
    liquidators?: number
  }): AgentSwarm {
    const rpcUrl = config?.rpcUrl ?? 'http://localhost:8545'
    const swarm = new AgentSwarm()

    // Anvil's deterministic private keys (accounts 1-19, 0 is deployer)
    const ANVIL_KEYS: `0x${string}`[] = [
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // account 1
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // account 2
      '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // account 3
      '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // account 4
      '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // account 5
      '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e', // account 6
      '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', // account 7
      '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97', // account 8
      '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6', // account 9
    ]

    let keyIdx = 0
    const nextKey = () => {
      if (keyIdx >= ANVIL_KEYS.length) throw new Error('No more Anvil keys available')
      return ANVIL_KEYS[keyIdx++]
    }

    const traderCount = config?.traders ?? 2
    const arbCount = config?.arbitrageurs ?? 1
    const liqCount = config?.liquidators ?? 1

    for (let i = 0; i < traderCount; i++) {
      swarm.addAgent({ name: `trader-${i + 1}`, role: 'trader', privateKey: nextKey(), rpcUrl })
    }
    for (let i = 0; i < arbCount; i++) {
      swarm.addAgent({ name: `arb-${i + 1}`, role: 'arbitrageur', privateKey: nextKey(), rpcUrl })
    }
    for (let i = 0; i < liqCount; i++) {
      swarm.addAgent({ name: `liquidator-${i + 1}`, role: 'liquidator', privateKey: nextKey(), rpcUrl })
    }

    return swarm
  },

  /**
   * Wire up standard signal patterns for a trading swarm:
   * - Oracle agents broadcast price updates
   * - Arbitrageurs listen for price deviations
   * - Liquidators listen for unhealthy positions
   * - Traders listen for entry signals
   */
  wireStandardSignals(swarm: AgentSwarm): void {
    // Arbitrageurs respond to price signals
    swarm.bus.on('price-update', async (signal) => {
      const arbs = swarm.getAgents('arbitrageur')
      for (const arb of arbs) {
        arb.touch()
        // Agents handle their own strategy logic; the signal just triggers evaluation
      }
    })

    // Liquidators respond to health-factor alerts
    swarm.bus.on('low-health-factor', async (signal) => {
      const liqs = swarm.getAgents('liquidator')
      for (const liq of liqs) {
        liq.touch()
      }
    })

    // All agents log activity
    swarm.bus.onAny(async (signal) => {
      // Signal history is automatically maintained by SignalBus
    })
  },
}
