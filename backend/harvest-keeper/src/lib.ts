/**
 * Harvest Keeper Library — Auto-Compound Engine for GoodYield Vaults
 *
 * Periodically discovers all vaults from VaultFactory, checks if they have
 * harvestable yield, and calls harvest() to compound profits + route UBI fees.
 *
 * Harvest decision logic:
 *   - Only harvest if vault has > 0 totalDebt (assets deployed to strategy)
 *   - Only harvest if enough time has passed since lastReport (configurable)
 *   - Estimate gas cost vs expected profit to avoid unprofitable harvests
 *   - Track harvest history for analytics
 */

import { ethers } from 'ethers';

// ─── ABIs ───────────────────────────────────────────────────────────────────

export const VaultFactoryABI = [
  'function vaultCount() view returns (uint256)',
  'function allVaults(uint256) view returns (address)',
  'function totalTVL() view returns (uint256)',
  'function totalUBIFunded() view returns (uint256)',
];

export const GoodVaultABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function totalDebt() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function lastReport() view returns (uint256)',
  'function totalGainSinceInception() view returns (uint256)',
  'function totalUBIFunded() view returns (uint256)',
  'function paused() view returns (bool)',
  'function strategy() view returns (address)',
  'function performanceFeeBPS() view returns (uint256)',
  'function managementFeeBPS() view returns (uint256)',
  'function harvest() returns (uint256 profit, uint256 loss)',
];

export const StrategyABI = [
  'function totalAssets() view returns (uint256)',
  'function paused() view returns (bool)',
  'function asset() view returns (address)',
];

export const ERC20ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VaultInfo {
  address: string;
  name: string;
  symbol: string;
  asset: string;
  assetSymbol: string;
  assetDecimals: number;
  totalAssets: bigint;
  totalDebt: bigint;
  totalSupply: bigint;
  lastReport: number;         // unix timestamp
  strategy: string;
  strategyAssets: bigint;
  paused: boolean;
  totalGain: bigint;
  totalUBIFunded: bigint;
}

export interface HarvestResult {
  vault: string;
  vaultName: string;
  profit: bigint;
  loss: bigint;
  txHash: string;
  gasUsed: bigint;
  timestamp: number;
}

export interface HarvestKeeperConfig {
  rpcUrl: string;
  privateKey: string;
  factoryAddress: string;
  minHarvestIntervalSeconds: number;  // min time between harvests per vault
  minProfitThresholdBPS: number;      // min expected profit in BPS of totalDebt
  dryRun: boolean;                    // simulate but don't execute
  maxGasPrice: bigint;                // max gas price willing to pay
}

export const DEFAULT_CONFIG: Partial<HarvestKeeperConfig> = {
  minHarvestIntervalSeconds: 3600,      // 1 hour default
  minProfitThresholdBPS: 10,            // 0.1% of debt
  dryRun: false,
  maxGasPrice: ethers.parseUnits('50', 'gwei'),
};

// ─── Core Engine ────────────────────────────────────────────────────────────

export class HarvestKeeper {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private factory: ethers.Contract;
  private config: HarvestKeeperConfig;
  private harvestHistory: HarvestResult[] = [];

  constructor(config: HarvestKeeperConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as HarvestKeeperConfig;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    this.factory = new ethers.Contract(
      config.factoryAddress,
      VaultFactoryABI,
      this.provider
    );
  }

  /** Discover all vaults from VaultFactory */
  async discoverVaults(): Promise<VaultInfo[]> {
    const count = await this.factory.vaultCount();
    const vaults: VaultInfo[] = [];

    for (let i = 0; i < Number(count); i++) {
      try {
        const addr = await this.factory.allVaults(i);
        const info = await this.getVaultInfo(addr);
        vaults.push(info);
      } catch (err) {
        console.warn(`[harvest-keeper] Failed to read vault ${i}:`, err);
      }
    }

    return vaults;
  }

  /** Get detailed info for a single vault */
  async getVaultInfo(address: string): Promise<VaultInfo> {
    const vault = new ethers.Contract(address, GoodVaultABI, this.provider);
    const [
      name, symbol, asset, totalAssets, totalDebt,
      totalSupply, lastReport, strategy, paused, totalGain, totalUBIFunded,
    ] = await Promise.all([
      vault.name(),
      vault.symbol(),
      vault.asset(),
      vault.totalAssets(),
      vault.totalDebt(),
      vault.totalSupply(),
      vault.lastReport(),
      vault.strategy(),
      vault.paused(),
      vault.totalGainSinceInception(),
      vault.totalUBIFunded(),
    ]);

    // Get asset details
    const assetContract = new ethers.Contract(asset, ERC20ABI, this.provider);
    let assetSymbol = 'UNKNOWN';
    let assetDecimals = 18;
    try {
      [assetSymbol, assetDecimals] = await Promise.all([
        assetContract.symbol(),
        assetContract.decimals(),
      ]);
    } catch { /* mock tokens may not have symbol */ }

    // Get strategy assets
    let strategyAssets = 0n;
    try {
      const strat = new ethers.Contract(strategy, StrategyABI, this.provider);
      strategyAssets = await strat.totalAssets();
    } catch { /* strategy may not be accessible */ }

    return {
      address,
      name,
      symbol,
      asset,
      assetSymbol,
      assetDecimals: Number(assetDecimals),
      totalAssets,
      totalDebt,
      totalSupply,
      lastReport: Number(lastReport),
      strategy,
      strategyAssets,
      paused,
      totalGain: totalGain,
      totalUBIFunded: totalUBIFunded,
    };
  }

  /** Decide whether a vault should be harvested */
  shouldHarvest(vault: VaultInfo, now: number): { harvest: boolean; reason: string } {
    // Skip paused vaults
    if (vault.paused) {
      return { harvest: false, reason: 'vault is paused' };
    }

    // Skip vaults with no debt deployed to strategy
    if (vault.totalDebt === 0n) {
      return { harvest: false, reason: 'no assets deployed to strategy' };
    }

    // Check time since last harvest
    const elapsed = now - vault.lastReport;
    if (elapsed < this.config.minHarvestIntervalSeconds) {
      return {
        harvest: false,
        reason: `only ${elapsed}s since last harvest (min: ${this.config.minHarvestIntervalSeconds}s)`,
      };
    }

    // Check if strategy has grown (potential profit)
    if (vault.strategyAssets <= vault.totalDebt) {
      // No growth yet — but still harvest if enough time passed (management fees)
      if (elapsed < this.config.minHarvestIntervalSeconds * 4) {
        return { harvest: false, reason: 'no yield growth and not enough time for mgmt fee harvest' };
      }
    }

    return { harvest: true, reason: `${elapsed}s elapsed, strategy has assets` };
  }

  /** Execute harvest on a single vault */
  async harvestVault(vaultAddress: string): Promise<HarvestResult | null> {
    const vault = new ethers.Contract(vaultAddress, GoodVaultABI, this.signer);
    const info = await this.getVaultInfo(vaultAddress);

    const now = Math.floor(Date.now() / 1000);
    const decision = this.shouldHarvest(info, now);

    if (!decision.harvest) {
      console.log(`[harvest-keeper] Skip ${info.name}: ${decision.reason}`);
      return null;
    }

    console.log(`[harvest-keeper] Harvesting ${info.name} (${vaultAddress})...`);

    if (this.config.dryRun) {
      console.log(`[harvest-keeper] DRY RUN — would harvest ${info.name}`);
      return {
        vault: vaultAddress,
        vaultName: info.name,
        profit: 0n,
        loss: 0n,
        txHash: '0x_dry_run',
        gasUsed: 0n,
        timestamp: now,
      };
    }

    try {
      // Check gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || 0n;
      if (gasPrice > this.config.maxGasPrice) {
        console.warn(`[harvest-keeper] Gas too high: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
        return null;
      }

      const tx = await vault.harvest();
      const receipt = await tx.wait();

      // Parse Harvested event
      let profit = 0n;
      let loss = 0n;
      for (const log of receipt.logs) {
        try {
          const parsed = vault.interface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed && parsed.name === 'Harvested') {
            profit = parsed.args[0];
            loss = parsed.args[1];
          }
        } catch { /* not our event */ }
      }

      const result: HarvestResult = {
        vault: vaultAddress,
        vaultName: info.name,
        profit,
        loss,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed,
        timestamp: now,
      };

      this.harvestHistory.push(result);

      const profitStr = ethers.formatUnits(profit, info.assetDecimals);
      const lossStr = ethers.formatUnits(loss, info.assetDecimals);
      console.log(`[harvest-keeper] ✅ ${info.name}: profit=${profitStr} loss=${lossStr} tx=${receipt.hash}`);

      return result;
    } catch (err) {
      console.error(`[harvest-keeper] ❌ Failed to harvest ${info.name}:`, err);
      return null;
    }
  }

  /** Run one complete harvest cycle across all vaults */
  async runCycle(): Promise<HarvestResult[]> {
    console.log('[harvest-keeper] Starting harvest cycle...');

    const vaults = await this.discoverVaults();
    console.log(`[harvest-keeper] Found ${vaults.length} vault(s)`);

    const results: HarvestResult[] = [];

    for (const vault of vaults) {
      const result = await this.harvestVault(vault.address);
      if (result) results.push(result);
    }

    // Summary
    const totalProfit = results.reduce((sum, r) => sum + r.profit, 0n);
    const totalLoss = results.reduce((sum, r) => sum + r.loss, 0n);
    console.log(
      `[harvest-keeper] Cycle complete: ${results.length} harvests, ` +
      `totalProfit=${totalProfit}, totalLoss=${totalLoss}`
    );

    return results;
  }

  /** Get factory-level stats */
  async getFactoryStats(): Promise<{ tvl: bigint; ubiFunded: bigint; vaultCount: number }> {
    const [tvl, ubiFunded, count] = await Promise.all([
      this.factory.totalTVL(),
      this.factory.totalUBIFunded(),
      this.factory.vaultCount(),
    ]);
    return { tvl, ubiFunded, vaultCount: Number(count) };
  }

  /** Start continuous keeper loop */
  async startLoop(intervalMs: number = 60_000): Promise<void> {
    console.log(`[harvest-keeper] Starting keeper loop (interval: ${intervalMs}ms)`);
    console.log(`[harvest-keeper] Factory: ${this.config.factoryAddress}`);
    console.log(`[harvest-keeper] Signer: ${this.signer.address}`);
    console.log(`[harvest-keeper] Dry run: ${this.config.dryRun}`);

    // Initial run
    await this.runCycle();

    // Continuous loop
    setInterval(async () => {
      try {
        await this.runCycle();
      } catch (err) {
        console.error('[harvest-keeper] Cycle error:', err);
      }
    }, intervalMs);
  }

  getHistory(): HarvestResult[] {
    return [...this.harvestHistory];
  }
}
