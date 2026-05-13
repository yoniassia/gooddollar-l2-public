import { ADDRESSES, CHAIN_CONFIG } from '../addresses'
import { ERC20ABI, PerpEngineABI, MarketFactoryABI, GoodLendPoolABI, CollateralVaultABI, SyntheticAssetFactoryABI, MarginVaultABI, UBIFeeHookABI } from '../abis'
import { GoodDollarSDK, gooddollarL2 } from '../client'

describe('addresses', () => {
  it('should export all known contract addresses', () => {
    expect(ADDRESSES.GoodDollarToken).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.PerpEngine).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.MarketFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.GoodLendPool).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.CollateralVault).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.SyntheticAssetFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.MarginVault).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.UBIFeeHook).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.MockUSDC).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(ADDRESSES.MockWETH).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('should have correct chain config', () => {
    expect(CHAIN_CONFIG.id).toBe(42069)
    expect(CHAIN_CONFIG.name).toBe('GoodDollar L2')
    expect(CHAIN_CONFIG.rpcUrl).toBe('http://localhost:8545')
  })

  it('should have unique addresses', () => {
    const values = Object.values(ADDRESSES)
    const unique = new Set(values.map(v => v.toLowerCase()))
    expect(unique.size).toBe(values.length)
  })
})

describe('ABIs', () => {
  const abis = [
    { name: 'ERC20', abi: ERC20ABI, expectedFns: ['balanceOf', 'approve', 'transfer', 'allowance', 'totalSupply'] },
    { name: 'PerpEngine', abi: PerpEngineABI, expectedFns: ['openPosition', 'closePosition', 'positions', 'marketCount', 'unrealizedPnL'] },
    { name: 'MarketFactory', abi: MarketFactoryABI, expectedFns: ['createMarket', 'buy', 'redeem', 'getMarket', 'marketCount'] },
    { name: 'GoodLendPool', abi: GoodLendPoolABI, expectedFns: ['supply', 'withdraw', 'borrow', 'repay', 'getUserAccountData', 'getReserveData'] },
    { name: 'CollateralVault', abi: CollateralVaultABI, expectedFns: ['depositAndMint', 'burn', 'getPosition', 'getCollateralRatio'] },
    { name: 'SyntheticAssetFactory', abi: SyntheticAssetFactoryABI, expectedFns: ['getAsset', 'allTickers'] },
    { name: 'MarginVault', abi: MarginVaultABI, expectedFns: ['deposit', 'withdraw', 'balances'] },
    { name: 'UBIFeeHook', abi: UBIFeeHookABI, expectedFns: ['calculateUBIFee', 'totalSwapsProcessed', 'totalUBIFees'] },
  ]

  for (const { name, abi, expectedFns } of abis) {
    it(`${name} ABI should contain required functions`, () => {
      const fnNames = abi
        .filter((item: any) => item.type === 'function')
        .map((item: any) => item.name)
      for (const fn of expectedFns) {
        expect(fnNames).toContain(fn)
      }
    })

    it(`${name} ABI items should have valid structure`, () => {
      for (const item of abi) {
        expect(item).toHaveProperty('type')
        if ((item as any).type === 'function') {
          expect(item).toHaveProperty('name')
          expect(item).toHaveProperty('inputs')
          expect(item).toHaveProperty('stateMutability')
        }
      }
    })
  }
})

describe('GoodDollarSDK', () => {
  it('should create read-only instance without private key', () => {
    const sdk = new GoodDollarSDK()
    expect(sdk.publicClient).toBeDefined()
    expect(sdk.walletClient).toBeNull()
    expect(sdk.account).toBeNull()
    expect(sdk.perps).toBeDefined()
    expect(sdk.predict).toBeDefined()
    expect(sdk.lend).toBeDefined()
    expect(sdk.stocks).toBeDefined()
    expect(sdk.swap).toBeDefined()
    expect(sdk.ubi).toBeDefined()
  })

  it('should create writable instance with private key', () => {
    const sdk = new GoodDollarSDK({
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    })
    expect(sdk.account).toBeDefined()
    expect(sdk.walletClient).toBeDefined()
    expect(sdk.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  })

  it('should throw when accessing address in read-only mode', () => {
    const sdk = new GoodDollarSDK()
    expect(() => sdk.address).toThrow('No private key configured')
  })

  it('should accept custom rpc url', () => {
    const sdk = new GoodDollarSDK({ rpcUrl: 'http://custom:8545' })
    expect(sdk.publicClient).toBeDefined()
  })
})

describe('gooddollarL2 chain', () => {
  it('should have correct chain definition', () => {
    expect(gooddollarL2.id).toBe(42069)
    expect(gooddollarL2.name).toBe('GoodDollar L2')
    expect(gooddollarL2.nativeCurrency.symbol).toBe('ETH')
  })
})

describe('index exports', () => {
  it('should re-export everything from index', () => {
    const mod = require('../index')
    expect(mod.GoodDollarSDK).toBeDefined()
    expect(mod.ADDRESSES).toBeDefined()
    expect(mod.CHAIN_CONFIG).toBeDefined()
    expect(mod.gooddollarL2).toBeDefined()
    expect(mod.ERC20ABI).toBeDefined()
    expect(mod.PerpEngineABI).toBeDefined()
    expect(mod.MarketFactoryABI).toBeDefined()
    expect(mod.GoodLendPoolABI).toBeDefined()
    expect(mod.CollateralVaultABI).toBeDefined()
    expect(mod.MarginVaultABI).toBeDefined()
    expect(mod.UBIFeeHookABI).toBeDefined()
  })
})
