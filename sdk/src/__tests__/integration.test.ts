/**
 * Integration tests for @gooddollar/agent-sdk against live GoodDollar L2 devnet
 *
 * These tests connect to the actual Anvil devnet (http://localhost:8545)
 * and verify real on-chain interactions work end-to-end.
 *
 * Run: npx jest --testPathPattern=integration --no-cache
 * Requires: Anvil running on localhost:8545 with deployed contracts
 */
import { GoodDollarSDK } from '../client'
import { ADDRESSES, CHAIN_CONFIG } from '../addresses'

// Anvil deployer account (account #0)
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const DEPLOYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

// Second Anvil test account (#1) for isolation
const AGENT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const AGENT_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const RPC = 'http://localhost:8545'

// Helper: check if chain is reachable
async function isChainAlive(): Promise<boolean> {
  try {
    const sdk = new GoodDollarSDK({ rpcUrl: RPC })
    await sdk.publicClient.getBlockNumber()
    return true
  } catch {
    return false
  }
}

// Increase timeout for on-chain txs
jest.setTimeout(30_000)

describe('Integration: SDK against live devnet', () => {
  let sdk: GoodDollarSDK
  let readOnly: GoodDollarSDK
  let alive: boolean

  beforeAll(async () => {
    alive = await isChainAlive()
    if (!alive) {
      console.warn('⚠️  Devnet not reachable — skipping integration tests')
      return
    }
    sdk = new GoodDollarSDK({ rpcUrl: RPC, privateKey: DEPLOYER_KEY })
    readOnly = new GoodDollarSDK({ rpcUrl: RPC })
  })

  // ─── Chain Connectivity ───────────────────────────────────────────────

  describe('Chain connectivity', () => {
    it('should connect to the devnet', async () => {
      if (!alive) return
      const blockNumber = await sdk.publicClient.getBlockNumber()
      expect(blockNumber).toBeGreaterThan(0n)
    })

    it('should have correct chain ID', async () => {
      if (!alive) return
      const chainId = await sdk.publicClient.getChainId()
      expect(chainId).toBe(CHAIN_CONFIG.id)
    })

    it('deployer should have ETH balance', async () => {
      if (!alive) return
      const balance = await sdk.getEthBalance()
      expect(balance).toBeGreaterThan(0n)
    })
  })

  // ─── ERC20 Token Reads ────────────────────────────────────────────────

  describe('Token reads', () => {
    it('should read GoodDollar token balance', async () => {
      if (!alive) return
      const balance = await sdk.getBalance('GoodDollarToken')
      // Deployer should have tokens from initial distribution
      expect(typeof balance).toBe('bigint')
    })

    it('should read USDC balance', async () => {
      if (!alive) return
      const balance = await sdk.getBalance('MockUSDC')
      expect(typeof balance).toBe('bigint')
    })

    it('should read WETH balance', async () => {
      if (!alive) return
      const balance = await sdk.getBalance('MockWETH')
      expect(typeof balance).toBe('bigint')
    })

    it('should read token balance for arbitrary address', async () => {
      if (!alive) return
      const balance = await sdk.getBalance('GoodDollarToken', AGENT_ADDR as `0x${string}`)
      expect(typeof balance).toBe('bigint')
    })
  })

  // ─── Perps Module ─────────────────────────────────────────────────────

  describe('Perps module', () => {
    it('should read market count', async () => {
      if (!alive) return
      const count = await sdk.perps.getMarketCount()
      expect(count).toBeGreaterThanOrEqual(0n)
    })

    it('should read margin balance', async () => {
      if (!alive) return
      const balance = await sdk.perps.getMarginBalance()
      expect(typeof balance).toBe('bigint')
    })

    it('should read position for deployer', async () => {
      if (!alive) return
      const pos = await sdk.perps.getPosition(0n)
      expect(pos).toHaveProperty('size')
      expect(pos).toHaveProperty('entryPrice')
      expect(pos).toHaveProperty('isLong')
      expect(pos).toHaveProperty('collateral')
    })

    it('should read unrealized PnL', async () => {
      if (!alive) return
      const pnl = await sdk.perps.getUnrealizedPnL(0n)
      expect(typeof pnl).toBe('bigint')
    })
  })

  // ─── Predict Module ───────────────────────────────────────────────────

  describe('Predict module', () => {
    it('should read market count', async () => {
      if (!alive) return
      const count = await sdk.predict.getMarketCount()
      expect(count).toBeGreaterThan(0n) // We deployed 10 seeded markets
    })

    it('should read market details', async () => {
      if (!alive) return
      const count = await sdk.predict.getMarketCount()
      if (count > 0n) {
        const market = await sdk.predict.getMarket(0n)
        expect(market.question).toBeDefined()
        expect(typeof market.question).toBe('string')
        expect(market.question.length).toBeGreaterThan(0)
        expect(typeof market.totalYES).toBe('bigint')
        expect(typeof market.totalNO).toBe('bigint')
      }
    })

    it('should read YES probability', async () => {
      if (!alive) return
      const count = await sdk.predict.getMarketCount()
      if (count > 0n) {
        const prob = await sdk.predict.getYesProbability(0n)
        expect(typeof prob).toBe('bigint')
        // Probability should be 0-10000 basis points
        expect(prob).toBeGreaterThanOrEqual(0n)
        expect(prob).toBeLessThanOrEqual(10000n)
      }
    })
  })

  // ─── Lend Module ──────────────────────────────────────────────────────

  describe('Lend module', () => {
    it('should read reserve data for GoodDollar', async () => {
      if (!alive) return
      const data = await sdk.lend.getReserveData(ADDRESSES.GoodDollarToken as `0x${string}`)
      expect(data).toHaveProperty('totalDeposits')
      expect(data).toHaveProperty('totalBorrows')
      expect(data).toHaveProperty('supplyRate')
      expect(data).toHaveProperty('borrowRate')
    })

    it('should read user account data', async () => {
      if (!alive) return
      const data = await sdk.lend.getAccountData()
      expect(data).toHaveProperty('healthFactor')
      expect(data).toHaveProperty('totalCollateralUSD')
      expect(data).toHaveProperty('totalDebtUSD')
    })

    it('should read reserve data for USDC', async () => {
      if (!alive) return
      const data = await sdk.lend.getReserveData(ADDRESSES.MockUSDC as `0x${string}`)
      expect(typeof data.totalDeposits).toBe('bigint')
    })
  })

  // ─── Stocks Module ───────────────────────────────────────────────────

  describe('Stocks module', () => {
    it('should list all synthetic tickers', async () => {
      if (!alive) return
      const tickers = await sdk.stocks.listTickers()
      expect(Array.isArray(tickers)).toBe(true)
      expect(tickers.length).toBeGreaterThan(0) // We deployed 12 stocks
    })

    it('should include AAPL and TSLA', async () => {
      if (!alive) return
      const tickers = await sdk.stocks.listTickers()
      expect(tickers).toContain('AAPL')
      expect(tickers).toContain('TSLA')
    })

    it('should get token address for ticker', async () => {
      if (!alive) return
      const addr = await sdk.stocks.getTokenAddress('AAPL')
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    it('should read position for deployer', async () => {
      if (!alive) return
      const pos = await sdk.stocks.getPosition('AAPL')
      expect(pos).toHaveProperty('collateral')
      expect(pos).toHaveProperty('debt')
      expect(pos).toHaveProperty('ratio')
    })
  })

  // ─── Swap / UBI Module ────────────────────────────────────────────────

  describe('Swap & UBI modules', () => {
    it('should calculate UBI fee', async () => {
      if (!alive) return
      const fee = await sdk.swap.getUBIFee(1000000000000000000n) // 1 ETH
      expect(typeof fee).toBe('bigint')
      expect(fee).toBeGreaterThan(0n) // Should be 33% = 0.33 ETH
    })

    it('should read total swaps', async () => {
      if (!alive) return
      const total = await sdk.swap.getTotalSwaps()
      expect(typeof total).toBe('bigint')
    })

    it('should read total UBI fees for G$', async () => {
      if (!alive) return
      const fees = await sdk.ubi.getTotalFees(ADDRESSES.GoodDollarToken as `0x${string}`)
      expect(typeof fees).toBe('bigint')
    })
  })

  // ─── Write Operations ─────────────────────────────────────────────────

  describe('Write operations', () => {
    it('should approve token spending', async () => {
      if (!alive) return
      const hash = await sdk.approve(
        ADDRESSES.GoodDollarToken as `0x${string}`,
        ADDRESSES.GoodLendPool as `0x${string}`,
        1000000000000000000n
      )
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
      const receipt = await sdk.waitForTx(hash)
      expect(receipt.status).toBe('success')
    })

    it('read-only SDK should throw on write operations', async () => {
      if (!alive) return
      await expect(
        readOnly.approve(
          ADDRESSES.GoodDollarToken as `0x${string}`,
          ADDRESSES.GoodLendPool as `0x${string}`,
          1n
        )
      ).rejects.toThrow('Write operations need a private key')
    })
  })

  // ─── Cross-module consistency ─────────────────────────────────────────

  describe('Cross-module consistency', () => {
    it('token balances should be consistent across methods', async () => {
      if (!alive) return
      const balance1 = await sdk.getBalance('GoodDollarToken')
      const balance2 = await sdk.getTokenBalance(ADDRESSES.GoodDollarToken as `0x${string}`)
      expect(balance1).toBe(balance2)
    })

    it('UBI fee + swap module should agree on total swaps', async () => {
      if (!alive) return
      const swapTotal = await sdk.swap.getTotalSwaps()
      const ubiTotal = await sdk.ubi.getTotalSwaps()
      expect(swapTotal).toBe(ubiTotal)
    })
  })
})
