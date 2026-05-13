/**
 * Li.Fi REST API client for cross-chain route finding and execution.
 *
 * API docs: https://docs.li.fi/li.fi-api/li.fi-api
 * Base URL: https://li.quest/v1
 *
 * Supported chains: Ethereum (1), Arbitrum (42161), Optimism (10),
 *   Polygon (137), Base (8453), BNB (56), Avalanche (43114), etc.
 */

import type { Logger } from 'pino'

const LIFI_API = 'https://li.quest/v1'
const INTEGRATOR = 'gooddollar-l2'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiFiQuoteParams {
  fromChain: number
  toChain: number
  fromToken: string      // Token address or symbol
  toToken: string
  fromAmount: string     // In wei/base units
  fromAddress: string
  toAddress?: string
  slippage?: number      // 0.005 = 0.5%
}

export interface LiFiStep {
  type: string
  tool: string
  toolDetails: { name: string; logoURI: string }
  action: {
    fromToken: { symbol: string; address: string; decimals: number; chainId: number }
    toToken: { symbol: string; address: string; decimals: number; chainId: number }
    fromAmount: string
    slippage: number
    fromChainId: number
    toChainId: number
  }
  estimate: {
    fromAmount: string
    toAmount: string
    toAmountMin: string
    executionDuration: number
    gasCosts: Array<{ amountUSD: string }>
  }
}

export interface LiFiRoute {
  id: string
  fromChainId: number
  toChainId: number
  fromAmount: string
  toAmount: string
  toAmountMin: string
  gasCostUSD: string
  steps: LiFiStep[]
  transactionRequest?: {
    to: string
    data: string
    value: string
    gasLimit: string
    from: string
    chainId: number
  }
}

export interface LiFiStatus {
  status: 'NOT_FOUND' | 'PENDING' | 'DONE' | 'FAILED'
  substatus?: string
  sending?: { txHash: string; chainId: number }
  receiving?: { txHash: string; chainId: number; amount: string }
}

// ─── Common token address mappings ────────────────────────────────────────────

export const CHAIN_TOKEN_ADDRESSES: Record<string, Record<number, string>> = {
  ETH: {
    1: '0x0000000000000000000000000000000000000000',
    42161: '0x0000000000000000000000000000000000000000',
    10: '0x0000000000000000000000000000000000000000',
    8453: '0x0000000000000000000000000000000000000000',
  },
  USDC: {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  USDT: {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  DAI: {
    1: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  },
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class LiFiClient {
  private log: Logger

  constructor(log: Logger) {
    this.log = log.child({ module: 'lifi-client' })
  }

  /**
   * Fetch the best route/quote from Li.Fi API
   */
  async getQuote(params: LiFiQuoteParams): Promise<LiFiRoute> {
    const searchParams = new URLSearchParams({
      fromChain: String(params.fromChain),
      toChain: String(params.toChain),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress || params.fromAddress,
      slippage: String(params.slippage ?? 0.005),
      integrator: INTEGRATOR,
    })

    this.log.info({ fromChain: params.fromChain, toChain: params.toChain, amount: params.fromAmount }, 'Fetching Li.Fi quote')

    const res = await fetch(`${LIFI_API}/quote?${searchParams}`, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any
      throw new Error(`Li.Fi API error ${res.status}: ${err?.message || 'unknown'}`)
    }

    const data = await res.json() as any
    const estimate = data.estimate ?? {}
    const action = data.action ?? {}
    const gasCosts = (estimate.gasCosts ?? []) as Array<{ amountUSD: string }>
    const totalGasUSD = gasCosts.reduce((sum, g) => sum + parseFloat(g.amountUSD || '0'), 0).toFixed(4)

    const route: LiFiRoute = {
      id: data.id ?? '',
      fromChainId: action.fromChainId ?? params.fromChain,
      toChainId: action.toChainId ?? params.toChain,
      fromAmount: action.fromAmount ?? params.fromAmount,
      toAmount: estimate.toAmount ?? '0',
      toAmountMin: estimate.toAmountMin ?? '0',
      gasCostUSD: totalGasUSD,
      steps: data.includedSteps ?? [data],
      transactionRequest: data.transactionRequest,
    }

    this.log.info({
      routeId: route.id,
      toAmount: route.toAmount,
      gasCostUSD: route.gasCostUSD,
      steps: route.steps.length,
    }, 'Li.Fi route found')

    return route
  }

  /**
   * Get advanced routes (multiple options)
   */
  async getRoutes(params: LiFiQuoteParams & { order?: 'RECOMMENDED' | 'FASTEST' | 'CHEAPEST' | 'SAFEST' }): Promise<LiFiRoute[]> {
    const body = {
      fromChainId: params.fromChain,
      toChainId: params.toChain,
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress || params.fromAddress,
      options: {
        slippage: params.slippage ?? 0.005,
        integrator: INTEGRATOR,
        order: params.order || 'RECOMMENDED',
      },
    }

    const res = await fetch(`${LIFI_API}/advanced/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any
      throw new Error(`Li.Fi routes API error ${res.status}: ${err?.message || 'unknown'}`)
    }

    const data = await res.json() as any
    return (data.routes || []).map((r: any) => ({
      id: r.id,
      fromChainId: r.fromChainId ?? params.fromChain,
      toChainId: r.toChainId ?? params.toChain,
      fromAmount: r.fromAmount ?? params.fromAmount,
      toAmount: r.toAmount ?? '0',
      toAmountMin: r.toAmountMin ?? '0',
      gasCostUSD: r.gasCostUSD ?? '0',
      steps: r.steps ?? [],
      transactionRequest: undefined,
    }))
  }

  /**
   * Check status of a Li.Fi transaction
   */
  async getStatus(txHash: string, fromChain: number, toChain: number): Promise<LiFiStatus> {
    const params = new URLSearchParams({
      txHash,
      bridge: 'lifi',
      fromChain: String(fromChain),
      toChain: String(toChain),
    })

    const res = await fetch(`${LIFI_API}/status?${params}`, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      return { status: 'NOT_FOUND' }
    }

    const data = await res.json() as any
    return {
      status: data.status || 'PENDING',
      substatus: data.substatus,
      sending: data.sending,
      receiving: data.receiving,
    }
  }

  /**
   * Get supported chains from Li.Fi
   */
  async getChains(): Promise<Array<{ id: number; name: string; key: string }>> {
    const res = await fetch(`${LIFI_API}/chains`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json() as any
    return (data.chains || []).map((c: any) => ({ id: c.id, name: c.name, key: c.key }))
  }

  /**
   * Get supported tokens on a chain
   */
  async getTokens(chainId: number): Promise<Array<{ address: string; symbol: string; decimals: number }>> {
    const res = await fetch(`${LIFI_API}/tokens?chains=${chainId}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json() as any
    return (data.tokens?.[String(chainId)] || []).map((t: any) => ({
      address: t.address,
      symbol: t.symbol,
      decimals: t.decimals,
    }))
  }
}
