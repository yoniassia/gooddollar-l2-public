/**
 * Tests for multi-agent orchestration helpers
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SignalBus, ManagedAgent, AgentSwarm, PortfolioAggregator, Strategies } from '../orchestration'
import type { AgentConfig, Signal } from '../orchestration'

// ─── SignalBus Tests ────────────────────────────────────────────────────────

describe('SignalBus', () => {
  let bus: SignalBus

  beforeEach(() => {
    bus = new SignalBus(100)
  })

  it('should deliver signals to type-specific handlers', async () => {
    const received: Signal[] = []
    bus.on('test', (s) => { received.push(s) })

    await bus.emit({ type: 'test', from: 'agent-1', data: { price: 3000 } })

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('test')
    expect(received[0].from).toBe('agent-1')
    expect(received[0].data.price).toBe(3000)
    expect(received[0].timestamp).toBeGreaterThan(0)
  })

  it('should not deliver to unrelated handlers', async () => {
    const received: Signal[] = []
    bus.on('other', (s) => { received.push(s) })

    await bus.emit({ type: 'test', from: 'agent-1', data: {} })

    expect(received).toHaveLength(0)
  })

  it('should deliver to wildcard (*) handlers', async () => {
    const received: Signal[] = []
    bus.onAny((s) => { received.push(s) })

    await bus.emit({ type: 'foo', from: 'a', data: {} })
    await bus.emit({ type: 'bar', from: 'b', data: {} })

    expect(received).toHaveLength(2)
    expect(received[0].type).toBe('foo')
    expect(received[1].type).toBe('bar')
  })

  it('should support unsubscribe', async () => {
    const received: Signal[] = []
    const unsub = bus.on('test', (s) => { received.push(s) })

    await bus.emit({ type: 'test', from: 'a', data: {} })
    unsub()
    await bus.emit({ type: 'test', from: 'b', data: {} })

    expect(received).toHaveLength(1)
  })

  it('should maintain signal history', async () => {
    await bus.emit({ type: 'a', from: 'x', data: { n: 1 } })
    await bus.emit({ type: 'b', from: 'y', data: { n: 2 } })
    await bus.emit({ type: 'a', from: 'z', data: { n: 3 } })

    expect(bus.getHistory()).toHaveLength(3)
    expect(bus.getHistory('a')).toHaveLength(2)
    expect(bus.getHistory('b')).toHaveLength(1)
    expect(bus.signalCount).toBe(3)
  })

  it('should cap history at maxHistory', async () => {
    const smallBus = new SignalBus(3)
    for (let i = 0; i < 5; i++) {
      await smallBus.emit({ type: 't', from: 'a', data: { i } })
    }
    expect(smallBus.getHistory()).toHaveLength(3)
    expect(smallBus.getHistory()[0].data.i).toBe(2) // oldest kept
  })

  it('should reset cleanly', async () => {
    bus.on('test', () => {})
    await bus.emit({ type: 'test', from: 'a', data: {} })
    bus.reset()

    expect(bus.signalCount).toBe(0)
    expect(bus.getHistory()).toHaveLength(0)
  })

  it('should handle async handlers', async () => {
    let resolved = false
    bus.on('async', async () => {
      await new Promise(r => setTimeout(r, 10))
      resolved = true
    })

    await bus.emit({ type: 'async', from: 'a', data: {} })
    expect(resolved).toBe(true)
  })

  it('should deliver to multiple handlers for same type', async () => {
    let count = 0
    bus.on('multi', () => { count++ })
    bus.on('multi', () => { count++ })
    bus.on('multi', () => { count++ })

    await bus.emit({ type: 'multi', from: 'a', data: {} })
    expect(count).toBe(3)
  })
})

// ─── AgentSwarm Tests ───────────────────────────────────────────────────────

// We use Anvil keys but mock the SDK calls since chain may not be running
const MOCK_KEYS: `0x${string}`[] = [
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
]

describe('AgentSwarm', () => {
  let swarm: AgentSwarm

  beforeEach(() => {
    swarm = new AgentSwarm()
  })

  it('should add and retrieve agents', () => {
    swarm.addAgent({ name: 'trader-1', role: 'trader', privateKey: MOCK_KEYS[0] })
    swarm.addAgent({ name: 'arb-1', role: 'arbitrageur', privateKey: MOCK_KEYS[1] })

    expect(swarm.size).toBe(2)
    expect(swarm.getAgent('trader-1').role).toBe('trader')
    expect(swarm.getAgent('arb-1').role).toBe('arbitrageur')
  })

  it('should reject duplicate agent names', () => {
    swarm.addAgent({ name: 'dupe', role: 'trader', privateKey: MOCK_KEYS[0] })
    expect(() => {
      swarm.addAgent({ name: 'dupe', role: 'trader', privateKey: MOCK_KEYS[1] })
    }).toThrow('already exists')
  })

  it('should throw for unknown agent names', () => {
    expect(() => swarm.getAgent('ghost')).toThrow('not found')
  })

  it('should remove agents', () => {
    swarm.addAgent({ name: 'temp', role: 'trader', privateKey: MOCK_KEYS[0] })
    expect(swarm.size).toBe(1)
    swarm.removeAgent('temp')
    expect(swarm.size).toBe(0)
  })

  it('should filter agents by role', () => {
    swarm.addAgent({ name: 't1', role: 'trader', privateKey: MOCK_KEYS[0] })
    swarm.addAgent({ name: 't2', role: 'trader', privateKey: MOCK_KEYS[1] })
    swarm.addAgent({ name: 'a1', role: 'arbitrageur', privateKey: MOCK_KEYS[2] })

    expect(swarm.getAgents('trader')).toHaveLength(2)
    expect(swarm.getAgents('arbitrageur')).toHaveLength(1)
    expect(swarm.getAgents('liquidator')).toHaveLength(0)
    expect(swarm.getAgents()).toHaveLength(3) // no filter = all
  })

  it('should broadcast signals through its bus', async () => {
    const received: Signal[] = []
    swarm.bus.on('alert', (s) => { received.push(s) })

    await swarm.broadcast('alert', { level: 'critical' })

    expect(received).toHaveLength(1)
    expect(received[0].from).toBe('_swarm')
    expect(received[0].data.level).toBe('critical')
  })

  it('should run tasks in parallel across role', async () => {
    swarm.addAgent({ name: 't1', role: 'trader', privateKey: MOCK_KEYS[0] })
    swarm.addAgent({ name: 't2', role: 'trader', privateKey: MOCK_KEYS[1] })
    swarm.addAgent({ name: 'a1', role: 'arbitrageur', privateKey: MOCK_KEYS[2] })

    const results = await swarm.runParallel('trader', async (agent) => {
      return `${agent.name}-done`
    })

    expect(results).toHaveLength(2)
    expect(results.map(r => r.result)).toContain('t1-done')
    expect(results.map(r => r.result)).toContain('t2-done')
  })

  it('should capture errors in parallel runs', async () => {
    swarm.addAgent({ name: 't1', role: 'trader', privateKey: MOCK_KEYS[0] })

    const results = await swarm.runParallel('trader', async () => {
      throw new Error('boom')
    })

    expect(results).toHaveLength(1)
    expect(results[0].error?.message).toBe('boom')
    expect(results[0].result).toBeUndefined()
  })

  it('should run tasks sequentially', async () => {
    swarm.addAgent({ name: 's1', role: 'trader', privateKey: MOCK_KEYS[0] })
    swarm.addAgent({ name: 's2', role: 'trader', privateKey: MOCK_KEYS[1] })

    const order: string[] = []
    const results = await swarm.runSequential(['s1', 's2'], async (agent) => {
      order.push(agent.name)
      return agent.name
    })

    expect(order).toEqual(['s1', 's2'])
    expect(results).toHaveLength(2)
  })

  it('should reset cleanly', () => {
    swarm.addAgent({ name: 'x', role: 'trader', privateKey: MOCK_KEYS[0] })
    swarm.reset()
    expect(swarm.size).toBe(0)
    expect(swarm.bus.signalCount).toBe(0)
  })
})

// ─── ManagedAgent Tests ─────────────────────────────────────────────────────

describe('ManagedAgent', () => {
  it('should expose address from private key', () => {
    const agent = new ManagedAgent({
      name: 'test',
      role: 'trader',
      privateKey: MOCK_KEYS[0],
    })
    // Anvil account 1 address
    expect(agent.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
    expect(agent.name).toBe('test')
    expect(agent.role).toBe('trader')
  })

  it('should track last active time', () => {
    const agent = new ManagedAgent({
      name: 'test',
      role: 'trader',
      privateKey: MOCK_KEYS[0],
    })
    const before = agent.lastActive
    agent.touch()
    expect(agent.lastActive).toBeGreaterThanOrEqual(before)
  })

  it('should store custom metadata', () => {
    const agent = new ManagedAgent({
      name: 'test',
      role: 'custom',
      privateKey: MOCK_KEYS[0],
      metadata: { strategy: 'momentum', maxLeverage: 5 },
    })
    expect(agent.metadata.strategy).toBe('momentum')
    expect(agent.metadata.maxLeverage).toBe(5)
  })
})

// ─── Strategies Tests ───────────────────────────────────────────────────────

describe('Strategies', () => {
  it('should create a devnet swarm with default config', () => {
    const swarm = Strategies.createDevnetSwarm()
    expect(swarm.size).toBe(4) // 2 traders + 1 arb + 1 liquidator
    expect(swarm.getAgents('trader')).toHaveLength(2)
    expect(swarm.getAgents('arbitrageur')).toHaveLength(1)
    expect(swarm.getAgents('liquidator')).toHaveLength(1)
  })

  it('should create a devnet swarm with custom counts', () => {
    const swarm = Strategies.createDevnetSwarm({
      traders: 3,
      arbitrageurs: 2,
      liquidators: 0,
    })
    expect(swarm.size).toBe(5)
    expect(swarm.getAgents('trader')).toHaveLength(3)
    expect(swarm.getAgents('arbitrageur')).toHaveLength(2)
    expect(swarm.getAgents('liquidator')).toHaveLength(0)
  })

  it('should throw when too many agents requested', () => {
    expect(() => {
      Strategies.createDevnetSwarm({ traders: 10 })
    }).toThrow('No more Anvil keys')
  })

  it('should wire standard signals without error', () => {
    const swarm = Strategies.createDevnetSwarm()
    expect(() => {
      Strategies.wireStandardSignals(swarm)
    }).not.toThrow()
  })
})
