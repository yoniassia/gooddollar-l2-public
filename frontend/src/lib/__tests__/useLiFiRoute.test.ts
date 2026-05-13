/**
 * useLiFiRoute unit tests
 *
 * Tests pure helpers and fetchLiFiQuote with a mocked fetch.
 * React hook testing deferred to E2E / integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLiFiQuote, LIFI_TOKEN_ADDRESSES, LIFI_SUPPORTED_CHAINS } from '../useLiFiRoute'

// ─── Fetch mock ───────────────────────────────────────────────────────────────

function mockFetch(response: object, status = 200) {
  const mockRes = {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(response),
  }
  return vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(mockRes as any)
}

// ─── Li.Fi API response fixture ───────────────────────────────────────────────

const MOCK_LIFI_QUOTE = {
  id: 'quote-abc123',
  action: {
    fromChainId: 1,
    toChainId: 42161,
    fromToken: { symbol: 'ETH', address: '0x000...', decimals: 18, chainId: 1 },
    toToken: { symbol: 'USDC', address: '0xaf88...', decimals: 6, chainId: 42161 },
    fromAmount: '1000000000000000000',
    slippage: 0.005,
  },
  estimate: {
    fromAmount: '1000000000000000000',
    toAmount: '2000000000',   // 2000 USDC (6 decimals)
    toAmountMin: '1990000000',
    priceImpact: '0.003',
    gasCosts: [
      { type: 'SEND', price: '20', estimate: '100000', limit: '150000', amount: '2000000000000000', amountUSD: '3.50', token: { symbol: 'ETH', decimals: 18, address: '0x000...' } },
    ],
    executionDuration: 90,
  },
  includedSteps: [
    {
      type: 'cross',
      tool: 'stargate',
      toolDetails: { name: 'Stargate', logoURI: 'https://...' },
      action: {
        fromToken: { symbol: 'ETH', address: '0x000...', decimals: 18, chainId: 1 },
        toToken: { symbol: 'USDC', address: '0xaf88...', decimals: 6, chainId: 42161 },
        fromAmount: '1000000000000000000',
        slippage: 0.005,
        fromChainId: 1,
        toChainId: 42161,
      },
      estimate: {
        fromAmount: '1000000000000000000',
        toAmount: '2000000000',
        toAmountMin: '1990000000',
        executionDuration: 90,
        gasCosts: [],
      },
    },
  ],
  tags: ['RECOMMENDED'],
  transactionRequest: {
    to: '0xLiFiDiamond',
    data: '0x...',
    value: '1000000000000000000',
    gasLimit: '150000',
    gasPrice: '20000000000',
    from: '0xUserAddress',
    chainId: 1,
  },
}

// ─── Token address lookup ─────────────────────────────────────────────────────

describe('LIFI_TOKEN_ADDRESSES', () => {
  it('contains ETH address for Ethereum mainnet', () => {
    expect(LIFI_TOKEN_ADDRESSES['ETH'][1]).toBe('0x0000000000000000000000000000000000000000')
  })

  it('contains USDC address for Arbitrum', () => {
    expect(LIFI_TOKEN_ADDRESSES['USDC'][42161]).toBeDefined()
    expect(LIFI_TOKEN_ADDRESSES['USDC'][42161]).toMatch(/^0x/)
  })

  it('contains USDC address for Optimism', () => {
    expect(LIFI_TOKEN_ADDRESSES['USDC'][10]).toBeDefined()
  })

  it('contains WBTC on Ethereum', () => {
    expect(LIFI_TOKEN_ADDRESSES['WBTC'][1]).toBeDefined()
  })

  it('contains ARB only on Arbitrum (not Ethereum)', () => {
    expect(LIFI_TOKEN_ADDRESSES['ARB'][42161]).toBeDefined()
    expect(LIFI_TOKEN_ADDRESSES['ARB']?.[1]).toBeUndefined()
  })
})

// ─── Supported chains ─────────────────────────────────────────────────────────

describe('LIFI_SUPPORTED_CHAINS', () => {
  it('includes Ethereum mainnet', () => {
    const eth = LIFI_SUPPORTED_CHAINS.find(c => c.id === 1)
    expect(eth).toBeDefined()
    expect(eth!.shortName).toBe('ETH')
  })

  it('includes Arbitrum', () => {
    expect(LIFI_SUPPORTED_CHAINS.find(c => c.id === 42161)).toBeDefined()
  })

  it('includes Base', () => {
    expect(LIFI_SUPPORTED_CHAINS.find(c => c.id === 8453)).toBeDefined()
  })

  it('has at least 5 chains', () => {
    expect(LIFI_SUPPORTED_CHAINS.length).toBeGreaterThanOrEqual(5)
  })
})

// ─── fetchLiFiQuote ───────────────────────────────────────────────────────────

describe('fetchLiFiQuote', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('constructs a valid route from the API response', async () => {
    mockFetch(MOCK_LIFI_QUOTE)

    const route = await fetchLiFiQuote({
      fromChain: 1,
      toChain: 42161,
      fromToken: 'ETH',
      toToken: 'USDC',
      fromAmount: '1000000000000000000',
      fromAddress: '0xUserAddress',
    })

    expect(route.fromChainId).toBe(1)
    expect(route.toChainId).toBe(42161)
    expect(route.toAmount).toBe('2000000000')
    expect(route.toAmountMin).toBe('1990000000')
    expect(route.priceImpact).toBeCloseTo(0.003)
    expect(route.gasCostUSD).toBe('3.5000')
    expect(route.steps).toHaveLength(1)
    expect(route.steps[0].tool).toBe('stargate')
    expect(route.tags).toContain('RECOMMENDED')
  })

  it('includes transactionRequest for execution', async () => {
    mockFetch(MOCK_LIFI_QUOTE)

    const route = await fetchLiFiQuote({
      fromChain: 1,
      toChain: 42161,
      fromToken: 'ETH',
      toToken: 'USDC',
      fromAmount: '1000000000000000000',
      fromAddress: '0xUserAddress',
    })

    expect(route.transactionRequest).toBeDefined()
    expect(route.transactionRequest!.to).toBe('0xLiFiDiamond')
    expect(route.transactionRequest!.chainId).toBe(1)
  })

  it('calls Li.Fi API with correct query parameters', async () => {
    const fetchSpy = mockFetch(MOCK_LIFI_QUOTE)

    await fetchLiFiQuote({
      fromChain: 1,
      toChain: 42161,
      fromToken: 'ETH',
      toToken: 'USDC',
      fromAmount: '500000000000000000',
      fromAddress: '0xTestUser',
      slippage: 0.01,
    })

    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toContain('fromChain=1')
    expect(calledUrl).toContain('toChain=42161')
    expect(calledUrl).toContain('fromAmount=500000000000000000')
    expect(calledUrl).toContain('slippage=0.01')
    expect(calledUrl).toContain('fromAddress=0xTestUser')
  })

  it('uses known USDC token address for Arbitrum', async () => {
    const fetchSpy = mockFetch(MOCK_LIFI_QUOTE)

    await fetchLiFiQuote({
      fromChain: 42161,
      toChain: 1,
      fromToken: 'USDC',
      toToken: 'ETH',
      fromAmount: '1000000000',
      fromAddress: '0xUser',
    })

    const calledUrl = fetchSpy.mock.calls[0][0] as string
    // Should use the known Arbitrum USDC address, not the symbol
    expect(calledUrl.toLowerCase()).toContain(LIFI_TOKEN_ADDRESSES['USDC'][42161].toLowerCase())
  })

  it('throws on API error', async () => {
    mockFetch({ message: 'Token not found' }, 400)

    await expect(fetchLiFiQuote({
      fromChain: 1,
      toChain: 42161,
      fromToken: 'UNKNOWN',
      toToken: 'USDC',
      fromAmount: '1000',
      fromAddress: '0xUser',
    })).rejects.toThrow('Token not found')
  })

  it('handles missing estimate fields gracefully', async () => {
    mockFetch({
      id: 'minimal',
      action: { fromChainId: 1, toChainId: 42161, fromToken: { symbol: 'ETH', address: '0x0', decimals: 18, chainId: 1 }, toToken: { symbol: 'USDC', address: '0xA0b', decimals: 6, chainId: 42161 }, fromAmount: '1000', slippage: 0.005 },
      estimate: { toAmount: '2000', toAmountMin: '1990', gasCosts: [] },
      includedSteps: [],
      tags: [],
    })

    const route = await fetchLiFiQuote({
      fromChain: 1, toChain: 42161, fromToken: 'ETH', toToken: 'USDC',
      fromAmount: '1000', fromAddress: '0xUser',
    })

    expect(route.toAmount).toBe('2000')
    expect(route.gasCostUSD).toBe('0.0000')
    expect(route.priceImpact).toBe(0)
    expect(route.steps).toHaveLength(0)
  })

  it('sums gas costs from multiple hops', async () => {
    const multiHopQuote = {
      ...MOCK_LIFI_QUOTE,
      estimate: {
        ...MOCK_LIFI_QUOTE.estimate,
        gasCosts: [
          { ...MOCK_LIFI_QUOTE.estimate.gasCosts[0], amountUSD: '2.00' },
          { ...MOCK_LIFI_QUOTE.estimate.gasCosts[0], amountUSD: '1.50' },
        ],
      },
    }
    mockFetch(multiHopQuote)

    const route = await fetchLiFiQuote({
      fromChain: 1, toChain: 42161, fromToken: 'ETH', toToken: 'USDC',
      fromAmount: '1000000000000000000', fromAddress: '0xUser',
    })

    expect(parseFloat(route.gasCostUSD)).toBeCloseTo(3.5)
  })

  it('uses default integrator tag when not specified', async () => {
    const fetchSpy = mockFetch(MOCK_LIFI_QUOTE)

    await fetchLiFiQuote({
      fromChain: 1, toChain: 42161, fromToken: 'ETH', toToken: 'USDC',
      fromAmount: '1000', fromAddress: '0xUser',
    })

    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toContain('integrator=gooddollar-l2')
  })

  it('uses custom integrator when provided', async () => {
    const fetchSpy = mockFetch(MOCK_LIFI_QUOTE)

    await fetchLiFiQuote({
      fromChain: 1, toChain: 42161, fromToken: 'ETH', toToken: 'USDC',
      fromAmount: '1000', fromAddress: '0xUser', integrator: 'my-dapp',
    })

    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toContain('integrator=my-dapp')
  })
})
