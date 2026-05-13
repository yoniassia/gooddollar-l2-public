'use client'

import { useState, useEffect, useCallback } from 'react'
import { DEVNET_RPC_URL, CONTRACTS as DEVNET_CONTRACTS } from '@/lib/devnet'
import { Skeleton } from '@/components/ui/skeleton'

const RPC_URL = DEVNET_RPC_URL

const TESTERS = [
  { name: 'Tester Alpha', role: 'Swaps & Lending', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', color: '#10b981', emoji: '🟢' },
  { name: 'Tester Beta', role: 'Perps & Predictions', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', color: '#f59e0b', emoji: '🟡' },
  { name: 'Tester Gamma', role: 'Stocks & Stress', address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', color: '#ef4444', emoji: '🔴' },
]

// Reverse map: lowercase address → contract name, derived from canonical devnet config
const CONTRACTS: Record<string, string> = Object.fromEntries(
  Object.entries(DEVNET_CONTRACTS).map(([name, addr]) => [(addr as string).toLowerCase(), name])
)

const TESTER_ADDRS = new Set(TESTERS.map(t => t.address.toLowerCase()))

async function rpcCall(method: string, params: unknown[] = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  })
  const data = await res.json()
  return data.result
}

function hexToNumber(hex: string): number {
  return parseInt(hex, 16)
}

function hexToEth(hex: string): string {
  const wei = BigInt(hex)
  const eth = Number(wei) / 1e18
  return eth.toFixed(eth < 1 ? 4 : 2)
}

function shortenHash(hash: string): string {
  return hash.slice(0, 10) + '…' + hash.slice(-6)
}

function getContractName(addr: string): string {
  return CONTRACTS[addr.toLowerCase()] || shortenHash(addr)
}

function getTesterInfo(addr: string) {
  return TESTERS.find(t => t.address.toLowerCase() === addr.toLowerCase())
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

interface TxInfo {
  hash: string
  from: string
  to: string
  value: string
  blockNumber: number
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  gasUsed: string
  contractName: string
}

interface TesterStats {
  address: string
  balance: string
  nonce: number
  name: string
  role: string
  color: string
  emoji: string
}

interface BlockInfo {
  number: number
  txCount: number
  timestamp: number
}

export default function ActivityPage() {
  const [transactions, setTransactions] = useState<TxInfo[]>([])
  const [testerStats, setTesterStats] = useState<TesterStats[]>([])
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const [contractHits, setContractHits] = useState<Record<string, number>>({})
  const [currentBlock, setCurrentBlock] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // Get latest block number
      const blockHex = await rpcCall('eth_blockNumber')
      const latestBlock = hexToNumber(blockHex)
      setCurrentBlock(latestBlock)

      // Fetch last 20 blocks
      const blockPromises = []
      const start = Math.max(0, latestBlock - 19)
      for (let i = latestBlock; i >= start; i--) {
        blockPromises.push(rpcCall('eth_getBlockByNumber', ['0x' + i.toString(16), true]))
      }
      const blockResults = await Promise.all(blockPromises)

      const newBlocks: BlockInfo[] = []
      const allTxs: TxInfo[] = []
      const hits: Record<string, number> = {}

      for (const block of blockResults) {
        if (!block) continue
        const blockNum = hexToNumber(block.number)
        const timestamp = hexToNumber(block.timestamp)
        const txs = block.transactions || []
        
        newBlocks.push({ number: blockNum, txCount: txs.length, timestamp })

        for (const tx of txs) {
          const to = tx.to || '(contract creation)'
          const toAddr = tx.to?.toLowerCase() || ''
          
          // Count contract hits
          const contractName = CONTRACTS[toAddr]
          if (contractName) {
            hits[contractName] = (hits[contractName] || 0) + 1
          }

          // Get receipt for status
          let status: 'success' | 'failed' | 'pending' = 'pending'
          let gasUsed = '0'
          try {
            const receipt = await rpcCall('eth_getTransactionReceipt', [tx.hash])
            if (receipt) {
              status = receipt.status === '0x1' ? 'success' : 'failed'
              gasUsed = hexToNumber(receipt.gasUsed).toLocaleString()
            }
          } catch { /* ignore */ }

          allTxs.push({
            hash: tx.hash,
            from: tx.from,
            to,
            value: tx.value,
            blockNumber: blockNum,
            timestamp,
            status,
            gasUsed,
            contractName: CONTRACTS[toAddr] || '',
          })
        }
      }

      setBlocks(newBlocks)
      setTransactions(allTxs.slice(0, 50))
      setContractHits(hits)

      // Fetch tester stats
      const testerPromises = TESTERS.map(async (t) => {
        const [balHex, nonceHex] = await Promise.all([
          rpcCall('eth_getBalance', [t.address, 'latest']),
          rpcCall('eth_getTransactionCount', [t.address, 'latest']),
        ])
        return {
          ...t,
          balance: hexToEth(balHex),
          nonce: hexToNumber(nonceHex),
        }
      })
      setTesterStats(await Promise.all(testerPromises))

      setLastUpdate(new Date())
      setLoading(false)
    } catch (e) {
      console.error('Fetch error:', e)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const maxBlockTxs = Math.max(1, ...blocks.map(b => b.txCount))

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Activity</h1>
          <p className="text-sm text-gray-400 mt-1">
            Block #{currentBlock.toLocaleString()} • Chain 42069
            {lastUpdate && <span> • Updated {lastUpdate.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-goodgreen animate-pulse" />
          <span className="text-xs text-goodgreen">Live</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-dark-100/60 border border-gray-700/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-20 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Skeleton className="h-3 w-12 mb-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div>
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Tester Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {testerStats.map((t) => (
              <div key={t.address} className="rounded-2xl bg-dark-100/60 border border-gray-700/30 p-4 hover:border-goodgreen/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{t.emoji}</span>
                  <div>
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.role}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">Balance</div>
                    <div className="text-sm font-mono text-white">{t.balance} ETH</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Transactions</div>
                    <div className="text-sm font-mono text-goodgreen">{t.nonce}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500 font-mono truncate">
                  {t.address}
                </div>
              </div>
            ))}
          </div>

          {/* Block Timeline */}
          <div className="rounded-2xl bg-dark-100/60 border border-gray-700/30 p-4 mb-8">
            <h2 className="text-sm font-semibold text-white mb-3">Block Timeline</h2>
            <div className="flex items-end gap-1 h-16">
              {blocks.slice().reverse().map((b) => (
                <div
                  key={b.number}
                  className="flex-1 group relative"
                  title={`Block ${b.number}: ${b.txCount} txs`}
                >
                  <div
                    className={`w-full rounded-t transition-all ${b.txCount > 0 ? 'bg-goodgreen' : 'bg-gray-700/30'}`}
                    style={{ height: `${Math.max(4, (b.txCount / maxBlockTxs) * 64)}px` }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-dark-50 text-xs text-white px-2 py-1 rounded whitespace-nowrap z-10">
                    #{b.number} • {b.txCount} tx
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">
                {blocks.length > 0 ? `#${blocks[blocks.length - 1]?.number}` : ''}
              </span>
              <span className="text-xs text-gray-500">
                {blocks.length > 0 ? `#${blocks[0]?.number}` : ''}
              </span>
            </div>
          </div>

          {/* Contract Activity */}
          {Object.keys(contractHits).length > 0 && (
            <div className="rounded-2xl bg-dark-100/60 border border-gray-700/30 p-4 mb-8">
              <h2 className="text-sm font-semibold text-white mb-3">Contract Activity (last 20 blocks)</h2>
              <div className="space-y-2">
                {Object.entries(contractHits)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, count]) => {
                    const maxHits = Math.max(...Object.values(contractHits))
                    return (
                      <div key={name} className="flex items-center gap-3">
                        <div className="w-36 text-xs text-gray-300 truncate">{name}</div>
                        <div className="flex-1 bg-gray-700/20 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-goodgreen rounded-full transition-all"
                            style={{ width: `${(count / maxHits) * 100}%` }}
                          />
                        </div>
                        <div className="w-8 text-xs text-goodgreen text-right">{count}</div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Transaction Feed */}
          <div className="rounded-2xl bg-dark-100/60 border border-gray-700/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700/30">
              <h2 className="text-sm font-semibold text-white">Recent Transactions ({transactions.length})</h2>
            </div>
            <div className="divide-y divide-gray-700/20 max-h-[600px] overflow-y-auto">
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No transactions in recent blocks</div>
              ) : (
                transactions.map((tx) => {
                  const tester = getTesterInfo(tx.from)
                  return (
                    <div key={tx.hash} className="px-4 py-3 hover:bg-dark-50/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.status === 'success' ? 'bg-green-400' : tx.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                          <a
                            href={`https://explorer.goodclaw.org/tx/${tx.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-goodgreen/80 hover:text-goodgreen truncate"
                          >
                            {shortenHash(tx.hash)}
                          </a>
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                          Block #{tx.blockNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {tester ? (
                            <span style={{ color: tester.color }}>{tester.emoji} {tester.name.split(' ')[1]}</span>
                          ) : (
                            shortenHash(tx.from)
                          )}
                        </span>
                        <span className="text-xs text-gray-600">→</span>
                        <span className="text-xs text-gray-300">
                          {tx.contractName ? (
                            <span className="bg-goodgreen/10 text-goodgreen px-1.5 py-0.5 rounded text-[10px]">
                              {tx.contractName}
                            </span>
                          ) : (
                            typeof tx.to === 'string' ? shortenHash(tx.to) : tx.to
                          )}
                        </span>
                        {tx.gasUsed !== '0' && (
                          <span className="text-[10px] text-gray-500 ml-auto">⛽ {tx.gasUsed}</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
