'use client'

/**
 * useStockTrades — on-chain trade history from CollateralVault events.
 *
 * Fetches Minted (buy) and Burned (sell) events emitted by CollateralVault
 * for the given user address. Events are decoded into TradeRecord objects
 * compatible with the stockData.ts types used throughout the UI.
 *
 * Ticker keys in events are bytes32 = keccak256(abi.encodePacked(ticker)).
 * We reverse-decode them by comparing against all known tickers.
 *
 * Price approximation:
 *   buy  price = collateralUsed / syntheticAmount  (G$ per synthetic token)
 *   sell price = collateralReturned / syntheticAmount
 *
 * Block timestamps are fetched in batch after log retrieval.
 *
 * Refresh: every 30 s via react-query refetchInterval.
 */

import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { keccak256, toBytes, parseAbiItem } from 'viem'
import { CONTRACTS } from './chain'
import { getAllTickers, type TradeRecord } from './stockData'

const MINTED_EVENT = parseAbiItem(
  'event Minted(address indexed user, bytes32 indexed ticker, uint256 syntheticAmount, uint256 collateralUsed, uint256 fee)',
)
const BURNED_EVENT = parseAbiItem(
  'event Burned(address indexed user, bytes32 indexed ticker, uint256 syntheticAmount, uint256 collateralReturned, uint256 fee)',
)

/** Reverse-decode a bytes32 ticker key to its string ticker symbol. */
function tickerFromKey(key: `0x${string}`, tickers: string[]): string | undefined {
  return tickers.find(t => keccak256(toBytes(t)) === key)
}

export interface StockTradesState {
  trades: TradeRecord[]
  isLoading: boolean
  isError: boolean
}

export function useStockTrades(
  userAddress: `0x${string}` | undefined,
): StockTradesState {
  const client = usePublicClient()

  const result = useQuery({
    queryKey: ['stockTrades', userAddress, CONTRACTS.CollateralVault],
    queryFn: async (): Promise<TradeRecord[]> => {
      if (!client || !userAddress) return []

      const tickers = getAllTickers()

      const [mintedLogs, burnedLogs] = await Promise.all([
        client.getLogs({
          address: CONTRACTS.CollateralVault,
          event: MINTED_EVENT,
          args: { user: userAddress },
          fromBlock: BigInt(0),
        }),
        client.getLogs({
          address: CONTRACTS.CollateralVault,
          event: BURNED_EVENT,
          args: { user: userAddress },
          fromBlock: BigInt(0),
        }),
      ])

      // Batch-fetch block timestamps for all unique blocks
      const allLogs = [...mintedLogs, ...burnedLogs]
      const uniqueBlocks = [
        ...new Set(
          allLogs.map(l => l.blockNumber).filter((n): n is bigint => n !== null),
        ),
      ]
      const blockTimestamps = new Map<bigint, number>()
      if (uniqueBlocks.length > 0) {
        const blocks = await Promise.all(
          uniqueBlocks.map(n => client.getBlock({ blockNumber: n })),
        )
        blocks.forEach((b, i) =>
          blockTimestamps.set(uniqueBlocks[i], Number(b.timestamp) * 1000),
        )
      }

      type MintedArgs = {
        user: `0x${string}`
        ticker: `0x${string}`
        syntheticAmount: bigint
        collateralUsed: bigint
        fee: bigint
      }
      type BurnedArgs = {
        user: `0x${string}`
        ticker: `0x${string}`
        syntheticAmount: bigint
        collateralReturned: bigint
        fee: bigint
      }

      const mintedTrades = mintedLogs
        .map(log => {
          const args = log.args as MintedArgs
          const ticker = tickerFromKey(args.ticker, tickers)
          if (!ticker) return null
          const shares = Number(args.syntheticAmount) / 1e18
          const price = shares > 0 ? Number(args.collateralUsed) / 1e18 / shares : 0
          return {
            id: `${log.transactionHash}-${log.logIndex}`,
            ticker,
            side: 'buy' as const,
            shares,
            price,
            timestamp: blockTimestamps.get(log.blockNumber!) ?? 0,
            pnl: 0,
          }
        })
        .filter(Boolean) as TradeRecord[]

      const burnedTrades = burnedLogs
        .map(log => {
          const args = log.args as BurnedArgs
          const ticker = tickerFromKey(args.ticker, tickers)
          if (!ticker) return null
          const shares = Number(args.syntheticAmount) / 1e18
          const price =
            shares > 0 ? Number(args.collateralReturned) / 1e18 / shares : 0
          return {
            id: `${log.transactionHash}-${log.logIndex}`,
            ticker,
            side: 'sell' as const,
            shares,
            price,
            timestamp: blockTimestamps.get(log.blockNumber!) ?? 0,
            pnl: 0,
          }
        })
        .filter(Boolean) as TradeRecord[]

      return [...mintedTrades, ...burnedTrades].sort(
        (a, b) => b.timestamp - a.timestamp,
      )
    },
    enabled: !!client && !!userAddress,
    refetchInterval: 30_000,
  })

  return {
    trades: result.data ?? [],
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
