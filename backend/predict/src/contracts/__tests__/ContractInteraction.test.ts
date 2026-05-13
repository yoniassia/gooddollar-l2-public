// ============================================================
// GoodPredict Contract Interaction Tests
// ============================================================
// Unit tests for the contract interaction layer.
// Uses mock provider to avoid requiring a live chain.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PredictContractInteraction, type PredictContractAddresses } from '../ContractInteraction.js';

// Mock ethers at module level
vi.mock('ethers', () => {
  const mockContract = {
    allowance: vi.fn().mockResolvedValue(BigInt('999999999999999999999999')),
    approve: vi.fn().mockResolvedValue({ hash: '0xapprove', wait: vi.fn().mockResolvedValue({}) }),
    createMarket: vi.fn().mockResolvedValue({
      hash: '0xcreate',
      wait: vi.fn().mockResolvedValue({
        logs: [{
          topics: ['0x123'],
          data: '0x',
        }],
      }),
    }),
    buy: vi.fn().mockResolvedValue({
      hash: '0xbuy',
      wait: vi.fn().mockResolvedValue({
        gasUsed: BigInt(150000),
        blockNumber: 42,
      }),
    }),
    closeMarket: vi.fn().mockResolvedValue({
      hash: '0xclose',
      wait: vi.fn().mockResolvedValue({}),
    }),
    resolve: vi.fn().mockResolvedValue({
      hash: '0xresolve',
      wait: vi.fn().mockResolvedValue({}),
    }),
    voidMarket: vi.fn().mockResolvedValue({
      hash: '0xvoid',
      wait: vi.fn().mockResolvedValue({}),
    }),
    getMarket: vi.fn().mockResolvedValue([
      'Will BTC hit $200k?',
      BigInt(1700000000),
      BigInt(0),
      BigInt('1000000000000000000000'),
      BigInt('500000000000000000000'),
      BigInt('1500000000000000000000'),
    ]),
    marketCount: vi.fn().mockResolvedValue(BigInt(2)),
    impliedProbabilityYES: vi.fn().mockResolvedValue(BigInt(6667)),
    balanceOf: vi.fn().mockResolvedValue(BigInt('100000000000000000000')),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    interface: {
      parseLog: vi.fn().mockReturnValue({
        name: 'MarketCreated',
        args: { marketId: BigInt(0) },
      }),
    },
  };

  return {
    ethers: {
      JsonRpcProvider: vi.fn().mockImplementation(() => ({
        getTransactionCount: vi.fn().mockResolvedValue(0),
      })),
      Wallet: vi.fn().mockImplementation(() => ({
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      })),
      Contract: vi.fn().mockImplementation(() => mockContract),
      parseEther: vi.fn((val: string) => BigInt(Math.floor(parseFloat(val) * 1e18))),
      formatEther: vi.fn((val: bigint) => (Number(val) / 1e18).toString()),
      MaxUint256: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
      ZeroAddress: '0x0000000000000000000000000000000000000000',
      id: vi.fn().mockReturnValue('0x1234'),
    },
  };
});

const TEST_ADDRESSES: PredictContractAddresses = {
  marketFactory: '0x1111111111111111111111111111111111111111',
  conditionalTokens: '0x2222222222222222222222222222222222222222',
  goodDollar: '0x3333333333333333333333333333333333333333',
  ubiFeeSplitter: '0x4444444444444444444444444444444444444444',
};

describe('PredictContractInteraction', () => {
  let contracts: PredictContractInteraction;

  beforeEach(async () => {
    contracts = new PredictContractInteraction(
      'http://localhost:8545',
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      TEST_ADDRESSES,
    );
    await contracts.init();
  });

  describe('init', () => {
    it('should initialize without errors', async () => {
      // init() already called in beforeEach
      expect(contracts).toBeDefined();
    });
  });

  describe('getMarketCount', () => {
    it('should return the number of markets', async () => {
      const count = await contracts.getMarketCount();
      expect(count).toBe(2);
    });
  });

  describe('getMarket', () => {
    it('should return on-chain market data', async () => {
      const market = await contracts.getMarket(0);
      expect(market.marketId).toBe(0);
      expect(market.question).toBe('Will BTC hit $200k?');
      expect(market.impliedProbYES).toBe(6667);
    });
  });

  describe('getTokenBalance', () => {
    it('should return token balance formatted as ether', async () => {
      const balance = await contracts.getTokenBalance(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        0,
        true,
      );
      expect(balance).toBeDefined();
    });
  });

  describe('syncMarkets', () => {
    it('should sync all on-chain markets', async () => {
      const markets = await contracts.syncMarkets();
      expect(markets.length).toBe(2);
      expect(markets[0].marketId).toBe(0);
      expect(markets[1].marketId).toBe(1);
    });
  });

  describe('settleBuy', () => {
    it('should settle a buy on-chain', async () => {
      const result = await contracts.settleBuy(0, true, '10', '0xbuyer');
      expect(result.txHash).toBe('0xbuy');
      expect(result.marketId).toBe(0);
      expect(result.isYES).toBe(true);
      expect(result.amount).toBe('10');
    });
  });

  describe('settleBatch', () => {
    it('should settle multiple trades', async () => {
      const results = await contracts.settleBatch([
        { marketId: 0, isYES: true, amount: '10', buyer: '0xbuyer1' },
        { marketId: 0, isYES: false, amount: '5', buyer: '0xbuyer2' },
      ]);
      expect(results.length).toBe(2);
    });
  });

  describe('createMarket', () => {
    it('should create a market on-chain', async () => {
      const result = await contracts.createMarket(
        'Will ETH hit $10k by 2026?',
        Math.floor(Date.now() / 1000) + 86400,
      );
      expect(result.txHash).toBe('0xcreate');
      expect(result.marketId).toBe(0);
    });
  });

  describe('closeMarket', () => {
    it('should close a market on-chain', async () => {
      const txHash = await contracts.closeMarket(0);
      expect(txHash).toBe('0xclose');
    });
  });

  describe('resolveMarket', () => {
    it('should resolve a market on-chain', async () => {
      const txHash = await contracts.resolveMarket(0, true);
      expect(txHash).toBe('0xresolve');
    });
  });

  describe('voidMarket', () => {
    it('should void a market on-chain', async () => {
      const txHash = await contracts.voidMarket(0);
      expect(txHash).toBe('0xvoid');
    });
  });
});
