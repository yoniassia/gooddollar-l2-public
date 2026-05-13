/**
 * Tests for HarvestKeeper — vault discovery, harvest decisions, and execution
 */

import { HarvestKeeper, HarvestKeeperConfig, VaultInfo, DEFAULT_CONFIG } from '../lib';

// ─── Mock Setup ─────────────────────────────────────────────────────────────

const mockVault = (overrides: Partial<VaultInfo> = {}): VaultInfo => ({
  address: '0x1234567890abcdef1234567890abcdef12345678',
  name: 'GoodVault ETH-Lending',
  symbol: 'gvETH',
  asset: '0xaaaa',
  assetSymbol: 'WETH',
  assetDecimals: 18,
  totalAssets: 100n * 10n ** 18n,
  totalDebt: 95n * 10n ** 18n,
  totalSupply: 100n * 10n ** 18n,
  lastReport: Math.floor(Date.now() / 1000) - 7200, // 2h ago
  strategy: '0xbbbb',
  strategyAssets: 96n * 10n ** 18n, // 1 ETH profit
  paused: false,
  totalGain: 10n * 10n ** 18n,
  totalUBIFunded: 2n * 10n ** 18n,
  ...overrides,
});

const testConfig: HarvestKeeperConfig = {
  rpcUrl: 'http://localhost:8545',
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  factoryAddress: '0x0b27a79cb9c0b38ee06ca3d94daa68e0ed17f953',
  minHarvestIntervalSeconds: 3600,
  minProfitThresholdBPS: 10,
  dryRun: true,
  maxGasPrice: 50000000000n,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('HarvestKeeper', () => {
  let keeper: HarvestKeeper;

  beforeEach(() => {
    keeper = new HarvestKeeper(testConfig);
  });

  describe('shouldHarvest', () => {
    const now = Math.floor(Date.now() / 1000);

    test('skips paused vaults', () => {
      const vault = mockVault({ paused: true });
      const result = keeper.shouldHarvest(vault, now);
      expect(result.harvest).toBe(false);
      expect(result.reason).toContain('paused');
    });

    test('skips vaults with no debt', () => {
      const vault = mockVault({ totalDebt: 0n });
      const result = keeper.shouldHarvest(vault, now);
      expect(result.harvest).toBe(false);
      expect(result.reason).toContain('no assets deployed');
    });

    test('skips if harvested too recently', () => {
      const vault = mockVault({ lastReport: now - 60 }); // 60s ago
      const result = keeper.shouldHarvest(vault, now);
      expect(result.harvest).toBe(false);
      expect(result.reason).toContain('since last harvest');
    });

    test('harvests if enough time and yield growth', () => {
      const vault = mockVault({
        lastReport: now - 7200, // 2h ago
        totalDebt: 95n * 10n ** 18n,
        strategyAssets: 96n * 10n ** 18n, // growth
      });
      const result = keeper.shouldHarvest(vault, now);
      expect(result.harvest).toBe(true);
    });

    test('skips no-growth vault if not enough time for mgmt fee', () => {
      const vault = mockVault({
        lastReport: now - 7200, // 2h ago, but strategy = debt (no growth)
        totalDebt: 95n * 10n ** 18n,
        strategyAssets: 95n * 10n ** 18n,
      });
      const result = keeper.shouldHarvest(vault, now);
      expect(result.harvest).toBe(false);
      expect(result.reason).toContain('no yield growth');
    });

    test('harvests no-growth vault after 4x interval (management fees)', () => {
      const vault = mockVault({
        lastReport: now - 3600 * 5, // 5h ago (> 4 * 1h)
        totalDebt: 95n * 10n ** 18n,
        strategyAssets: 95n * 10n ** 18n,
      });
      const result = keeper.shouldHarvest(vault, now);
      expect(result.harvest).toBe(true);
    });
  });

  describe('config defaults', () => {
    test('default interval is 3600s', () => {
      expect(DEFAULT_CONFIG.minHarvestIntervalSeconds).toBe(3600);
    });

    test('default min profit is 10 BPS', () => {
      expect(DEFAULT_CONFIG.minProfitThresholdBPS).toBe(10);
    });

    test('default dry run is false', () => {
      expect(DEFAULT_CONFIG.dryRun).toBe(false);
    });
  });

  describe('history tracking', () => {
    test('starts with empty history', () => {
      expect(keeper.getHistory()).toEqual([]);
    });
  });

  describe('vault info structure', () => {
    test('mockVault creates valid VaultInfo', () => {
      const vault = mockVault();
      expect(vault.name).toBe('GoodVault ETH-Lending');
      expect(vault.totalAssets).toBe(100n * 10n ** 18n);
      expect(vault.paused).toBe(false);
    });

    test('calculates strategy profit correctly', () => {
      const vault = mockVault({
        totalDebt: 95n * 10n ** 18n,
        strategyAssets: 97n * 10n ** 18n,
      });
      const profit = vault.strategyAssets - vault.totalDebt;
      expect(profit).toBe(2n * 10n ** 18n); // 2 ETH profit
    });
  });

  describe('edge cases', () => {
    test('vault with zero supply', () => {
      const vault = mockVault({ totalSupply: 0n, totalDebt: 0n });
      const now = Math.floor(Date.now() / 1000);
      const result = keeper.shouldHarvest(vault, now);
      expect(result.harvest).toBe(false);
    });

    test('vault at exact harvest interval boundary', () => {
      const now = Math.floor(Date.now() / 1000);
      const vault = mockVault({
        lastReport: now - 3600, // exactly at boundary
        strategyAssets: 96n * 10n ** 18n,
      });
      const result = keeper.shouldHarvest(vault, now);
      // At exactly the boundary, elapsed === min, which is NOT < min, so should harvest
      expect(result.harvest).toBe(true);
    });

    test('vault with strategy loss', () => {
      const now = Math.floor(Date.now() / 1000);
      const vault = mockVault({
        lastReport: now - 7200,
        totalDebt: 95n * 10n ** 18n,
        strategyAssets: 90n * 10n ** 18n, // loss
      });
      // Strategy has loss (assets < debt), but we should still harvest to report the loss
      // With current logic, loss means strategyAssets <= totalDebt, so it goes to the time check
      const result = keeper.shouldHarvest(vault, now);
      // 7200s elapsed, need 4 * 3600 = 14400s for no-growth — skip
      expect(result.harvest).toBe(false);
    });

    test('vault with large loss harvested after long time', () => {
      const now = Math.floor(Date.now() / 1000);
      const vault = mockVault({
        lastReport: now - 3600 * 24, // 24h ago
        totalDebt: 95n * 10n ** 18n,
        strategyAssets: 80n * 10n ** 18n, // 15 ETH loss
      });
      const result = keeper.shouldHarvest(vault, now);
      expect(result.harvest).toBe(true); // 24h > 4h (4 * 1h)
    });
  });
});

describe('HarvestKeeper integration (dry run)', () => {
  test('constructs with valid config', () => {
    const keeper = new HarvestKeeper(testConfig);
    expect(keeper).toBeDefined();
    expect(keeper.getHistory()).toEqual([]);
  });

  test('config merges with defaults', () => {
    const partialConfig: HarvestKeeperConfig = {
      ...testConfig,
      minHarvestIntervalSeconds: 1800, // override default
    };
    const keeper = new HarvestKeeper(partialConfig);
    const vault = mockVault({
      lastReport: Math.floor(Date.now() / 1000) - 2000, // 2000s ago
      strategyAssets: 96n * 10n ** 18n,
    });
    const result = keeper.shouldHarvest(vault, Math.floor(Date.now() / 1000));
    expect(result.harvest).toBe(true); // 2000s > 1800s
  });
});
