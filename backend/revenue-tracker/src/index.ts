/**
 * UBI Revenue Tracker Keeper
 *
 * Periodically queries each protocol's fee-generating contracts on GoodDollar L2
 * and reports cumulative fee data to the UBIRevenueTracker contract. Also takes
 * daily snapshots for the UBI Impact Dashboard charting.
 *
 * Architecture:
 *   1. ProtocolFeeCollector — reads fee data from each protocol's contracts
 *   2. RevenueReporter — calls UBIRevenueTracker.reportFees() + takeSnapshot()
 *   3. Main loop — runs every INTERVAL_MS, aggregates and reports
 *
 * Protocols tracked:
 *   - GoodSwap:    Pool trade volume → UBI fee routing
 *   - GoodPerps:   PerpEngine trading fees
 *   - GoodPredict: MarketFactory resolution fees
 *   - GoodLend:    Pool interest spread
 *   - GoodStable:  VaultManager stability fees
 *   - GoodStocks:  SyntheticAssetFactory mint/redeem fees
 *   - GoodBridge:  FastWithdrawalLP + MultiChainBridge fees
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();
const logger = pino({ name: 'revenue-tracker' });

// ─── Configuration ───────────────────────────────────────────────────────────

const RPC_URL = process.env.L2_RPC_URL ?? 'http://localhost:8545';
const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// UBIRevenueTracker contract
const TRACKER_ADDRESS = process.env.UBI_REVENUE_TRACKER ??
  '0x021DBfF4A864Aa25c51F0ad2Cd73266Fde66199d';

// Report interval — every 5 minutes for devnet, would be hourly in production
const REPORT_INTERVAL_MS = parseInt(process.env.REPORT_INTERVAL_MS ?? '300000', 10);

// Snapshot interval — take a daily snapshot every 24h (or SNAPSHOT_INTERVAL_MS)
const SNAPSHOT_INTERVAL_MS = parseInt(process.env.SNAPSHOT_INTERVAL_MS ?? '86400000', 10);

// ─── Contract ABIs ───────────────────────────────────────────────────────────

const TRACKER_ABI = [
  'function reportFees(uint256 protocolId, uint256 fees, uint256 ubi, uint256 txs) external',
  'function takeSnapshot() external',
  'function getProtocol(uint256 id) external view returns (tuple(string name, string category, address feeSource, uint256 totalFees, uint256 ubiContribution, uint256 txCount, uint256 lastUpdateBlock, bool active))',
  'function protocolCount() external view returns (uint256)',
  'function totalFeesTracked() external view returns (uint256)',
  'function totalUBITracked() external view returns (uint256)',
  'function totalTxTracked() external view returns (uint256)',
  'function snapshotCount() external view returns (uint256)',
  'function admin() external view returns (address)',
];

// UBIFeeSplitter — tracks aggregate fees across all protocols
const FEE_SPLITTER_ABI = [
  'function totalFeesCollected() external view returns (uint256)',
  'function totalUBIFunded() external view returns (uint256)',
  'function dAppCount() external view returns (uint256)',
];

// Protocol-specific ABIs for fee queries
const SWAP_POOL_ABI = [
  'function totalVolume() external view returns (uint256)',
  'function totalFees() external view returns (uint256)',
  'function swapCount() external view returns (uint256)',
];

const PERP_ENGINE_ABI = [
  'function totalFeesPaid() external view returns (uint256)',
  'function positionCount() external view returns (uint256)',
];

const MARKET_FACTORY_ABI = [
  'function marketCount() external view returns (uint256)',
];

const LEND_POOL_ABI = [
  'function totalBorrowed() external view returns (uint256)',
  'function totalInterestPaid() external view returns (uint256)',
];

const VAULT_MANAGER_ABI = [
  'function totalDebt() external view returns (uint256)',
  'function totalStabilityFees() external view returns (uint256)',
];

const SYNTHETIC_FACTORY_ABI = [
  'function totalMinted() external view returns (uint256)',
  'function totalFees() external view returns (uint256)',
];

// ─── Protocol Addresses ──────────────────────────────────────────────────────

interface ProtocolConfig {
  id: number;
  name: string;
  category: string;
  contracts: { address: string; abi: string[]; feeField?: string; txField?: string }[];
}

const PROTOCOLS: ProtocolConfig[] = [
  {
    id: 0,
    name: 'GoodSwap',
    category: 'swap',
    contracts: [{
      address: process.env.SWAP_POOL_GD_WETH ?? '0xA4899D35897033b927acFCf422bc745916139776',
      abi: SWAP_POOL_ABI,
      feeField: 'totalFees',
      txField: 'swapCount',
    }, {
      address: process.env.SWAP_POOL_GD_USDC ?? '0xf953b3A269d80e3eB0F2947630Da976B896A8C5b',
      abi: SWAP_POOL_ABI,
      feeField: 'totalFees',
      txField: 'swapCount',
    }, {
      address: process.env.SWAP_POOL_WETH_USDC ?? '0xAA292E8611aDF267e563f334Ee42320aC96D0463',
      abi: SWAP_POOL_ABI,
      feeField: 'totalFees',
      txField: 'swapCount',
    }],
  },
  {
    id: 1,
    name: 'GoodPerps',
    category: 'perps',
    contracts: [{
      address: process.env.PERP_ENGINE ?? '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      abi: PERP_ENGINE_ABI,
      feeField: 'totalFeesPaid',
      txField: 'positionCount',
    }],
  },
  {
    id: 2,
    name: 'GoodPredict',
    category: 'predict',
    contracts: [{
      address: process.env.MARKET_FACTORY ?? '0xc7cDb7A2E5dDa1B7A0E792Fe1ef08ED20A6F56D4',
      abi: MARKET_FACTORY_ABI,
      txField: 'marketCount',
    }],
  },
  {
    id: 3,
    name: 'GoodLend',
    category: 'lend',
    contracts: [{
      address: process.env.LEND_POOL ?? '0x322813fd9a801c5507c9de605d63cea4f2ce6c44',
      abi: LEND_POOL_ABI,
      feeField: 'totalInterestPaid',
    }],
  },
  {
    id: 4,
    name: 'GoodStable',
    category: 'stable',
    contracts: [{
      address: process.env.VAULT_MANAGER ?? '0xe039608E695D21aB11675EBBA00261A0e750526c',
      abi: VAULT_MANAGER_ABI,
      feeField: 'totalStabilityFees',
    }],
  },
  {
    id: 5,
    name: 'GoodStocks',
    category: 'stocks',
    contracts: [{
      address: process.env.SYNTHETIC_FACTORY ?? '0xd9140951d8aE6E5F625a02F5908535e16e3af964',
      abi: SYNTHETIC_FACTORY_ABI,
      feeField: 'totalFees',
    }],
  },
  {
    id: 6,
    name: 'GoodBridge',
    category: 'bridge',
    contracts: [], // Bridge fees tracked via events / L1 contract — placeholder for now
  },
];

// ─── Fee Collector ───────────────────────────────────────────────────────────

interface FeeReport {
  protocolId: number;
  name: string;
  totalFees: bigint;    // Cumulative fees from contracts
  ubiPortion: bigint;   // 33% of fees → UBI
  txCount: bigint;       // Cumulative transaction count
}

// Tracks last reported values to compute deltas
const lastReported = new Map<number, { fees: bigint; txs: bigint }>();

/**
 * Query a protocol's contracts for cumulative fee data.
 * Gracefully handles missing functions (devnet contracts may not all expose fee getters).
 */
async function collectProtocolFees(
  provider: ethers.JsonRpcProvider,
  protocol: ProtocolConfig,
): Promise<FeeReport> {
  let totalFees = 0n;
  let txCount = 0n;

  for (const contractDef of protocol.contracts) {
    try {
      const contract = new ethers.Contract(contractDef.address, contractDef.abi, provider);

      // Try to read fee total
      if (contractDef.feeField) {
        try {
          const fees = await contract[contractDef.feeField]();
          totalFees += BigInt(fees);
        } catch {
          // Function might not exist on this contract version
          logger.debug({ protocol: protocol.name, field: contractDef.feeField }, 'Fee field not available');
        }
      }

      // Try to read tx count
      if (contractDef.txField) {
        try {
          const count = await contract[contractDef.txField]();
          txCount += BigInt(count);
        } catch {
          logger.debug({ protocol: protocol.name, field: contractDef.txField }, 'Tx field not available');
        }
      }
    } catch (err) {
      logger.warn({ protocol: protocol.name, address: contractDef.address, err }, 'Failed to query contract');
    }
  }

  // UBI portion = 33% of fees (matching the 33% fee routing in UBIFeeSplitter)
  const ubiPortion = (totalFees * 33n) / 100n;

  return {
    protocolId: protocol.id,
    name: protocol.name,
    totalFees,
    ubiPortion,
    txCount,
  };
}

/**
 * Compute delta from last reported values.
 * Only report incremental changes (not cumulative totals).
 */
function computeDelta(report: FeeReport): { fees: bigint; ubi: bigint; txs: bigint } | null {
  const last = lastReported.get(report.protocolId);

  if (!last) {
    // First time — only report if there's something
    if (report.totalFees === 0n && report.txCount === 0n) return null;
    return { fees: report.totalFees, ubi: report.ubiPortion, txs: report.txCount };
  }

  const feesDelta = report.totalFees > last.fees ? report.totalFees - last.fees : 0n;
  const txsDelta = report.txCount > last.txs ? report.txCount - last.txs : 0n;

  // Nothing new to report
  if (feesDelta === 0n && txsDelta === 0n) return null;

  const ubiDelta = (feesDelta * 33n) / 100n;
  return { fees: feesDelta, ubi: ubiDelta, txs: txsDelta };
}

// ─── Revenue Reporter ────────────────────────────────────────────────────────

class RevenueReporter {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private tracker: ethers.Contract;
  private lastSnapshotTime: number = 0;

  constructor(rpcUrl: string, operatorKey: string, trackerAddress: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(operatorKey, this.provider);
    this.tracker = new ethers.Contract(trackerAddress, TRACKER_ABI, this.wallet);
  }

  /**
   * Initialize — read current tracker state to avoid re-reporting.
   */
  async init(): Promise<void> {
    try {
      const admin = await this.tracker.admin();
      const count = await this.tracker.protocolCount();
      const totalFees = await this.tracker.totalFeesTracked();
      const totalUBI = await this.tracker.totalUBITracked();
      const totalTx = await this.tracker.totalTxTracked();
      const snapshots = await this.tracker.snapshotCount();

      logger.info({
        admin,
        operator: this.wallet.address,
        protocols: Number(count),
        totalFees: ethers.formatEther(totalFees),
        totalUBI: ethers.formatEther(totalUBI),
        totalTx: Number(totalTx),
        snapshots: Number(snapshots),
      }, 'Connected to UBIRevenueTracker');

      // Load current protocol states
      for (let i = 0; i < Number(count); i++) {
        const p = await this.tracker.getProtocol(i);
        lastReported.set(i, { fees: 0n, txs: 0n });
        logger.info({
          id: i,
          name: p.name,
          category: p.category,
          totalFees: ethers.formatEther(p.totalFees),
          ubiContribution: ethers.formatEther(p.ubiContribution),
          txCount: Number(p.txCount),
        }, 'Loaded protocol state');
      }

      this.lastSnapshotTime = Date.now();
    } catch (err) {
      logger.fatal({ err }, 'Failed to initialize — is UBIRevenueTracker deployed?');
      throw err;
    }
  }

  /**
   * Collect fees from all protocols and report deltas to the tracker.
   */
  async runCycle(): Promise<void> {
    logger.info('Starting revenue collection cycle');

    let reportsSubmitted = 0;

    for (const protocol of PROTOCOLS) {
      try {
        const report = await collectProtocolFees(this.provider, protocol);
        const delta = computeDelta(report);

        if (!delta) {
          logger.debug({ protocol: protocol.name }, 'No new fees to report');
          continue;
        }

        // Report to tracker contract
        const tx = await this.tracker.reportFees(
          protocol.id,
          delta.fees,
          delta.ubi,
          delta.txs,
          { gasLimit: 200_000 },
        );
        const receipt = await tx.wait();

        // Update last reported
        lastReported.set(protocol.id, {
          fees: report.totalFees,
          txs: report.txCount,
        });

        reportsSubmitted++;
        logger.info({
          protocol: protocol.name,
          fees: ethers.formatEther(delta.fees),
          ubi: ethers.formatEther(delta.ubi),
          txs: Number(delta.txs),
          txHash: receipt.hash,
          gasUsed: receipt.gasUsed.toString(),
        }, 'Reported fees to tracker');
      } catch (err) {
        logger.error({ protocol: protocol.name, err }, 'Failed to report fees');
      }
    }

    // Check if we should take a daily snapshot
    const elapsed = Date.now() - this.lastSnapshotTime;
    if (elapsed >= SNAPSHOT_INTERVAL_MS) {
      await this.takeSnapshot();
    }

    logger.info({ reportsSubmitted, total: PROTOCOLS.length }, 'Revenue cycle complete');
  }

  /**
   * Take a daily snapshot for historical charting.
   */
  async takeSnapshot(): Promise<void> {
    try {
      const tx = await this.tracker.takeSnapshot({ gasLimit: 200_000 });
      const receipt = await tx.wait();
      this.lastSnapshotTime = Date.now();

      const totalFees = await this.tracker.totalFeesTracked();
      const totalUBI = await this.tracker.totalUBITracked();
      const snapCount = await this.tracker.snapshotCount();

      logger.info({
        txHash: receipt.hash,
        snapshotNumber: Number(snapCount),
        totalFees: ethers.formatEther(totalFees),
        totalUBI: ethers.formatEther(totalUBI),
      }, 'Daily snapshot taken');
    } catch (err) {
      logger.error({ err }, 'Failed to take snapshot');
    }
  }

  /**
   * Print current dashboard summary (for status reports).
   */
  async printStatus(): Promise<void> {
    const count = await this.tracker.protocolCount();
    const totalFees = await this.tracker.totalFeesTracked();
    const totalUBI = await this.tracker.totalUBITracked();
    const totalTx = await this.tracker.totalTxTracked();

    console.log('\n═══ UBI Revenue Tracker Status ═══');
    console.log(`Total Fees Tracked: ${ethers.formatEther(totalFees)} G$`);
    console.log(`Total UBI Funded:   ${ethers.formatEther(totalUBI)} G$`);
    console.log(`Total Transactions: ${totalTx}`);
    console.log('');

    for (let i = 0; i < Number(count); i++) {
      const p = await this.tracker.getProtocol(i);
      console.log(`  [${i}] ${p.name} (${p.category}): ${ethers.formatEther(p.totalFees)} fees, ${ethers.formatEther(p.ubiContribution)} UBI, ${Number(p.txCount)} txs`);
    }
    console.log('═══════════════════════════════════\n');
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  logger.info({
    rpc: RPC_URL,
    tracker: TRACKER_ADDRESS,
    reportInterval: REPORT_INTERVAL_MS,
    snapshotInterval: SNAPSHOT_INTERVAL_MS,
    protocols: PROTOCOLS.length,
  }, 'Starting UBI Revenue Tracker Keeper');

  const reporter = new RevenueReporter(RPC_URL, OPERATOR_KEY, TRACKER_ADDRESS);
  await reporter.init();

  // Print initial status
  await reporter.printStatus();

  // Run first cycle immediately
  await reporter.runCycle();

  // Then loop
  while (true) {
    await sleep(REPORT_INTERVAL_MS);
    try {
      await reporter.runCycle();
    } catch (err) {
      logger.error({ err }, 'Cycle failed');
    }
  }
}

// Support --status flag for one-shot status check
if (process.argv.includes('--status')) {
  const reporter = new RevenueReporter(RPC_URL, OPERATOR_KEY, TRACKER_ADDRESS);
  reporter.init()
    .then(() => reporter.printStatus())
    .then(() => process.exit(0))
    .catch(err => { logger.error({ err }, 'Status check failed'); process.exit(1); });
} else {
  main().catch(err => {
    logger.fatal({ err }, 'Fatal error');
    process.exit(1);
  });
}

export { RevenueReporter, collectProtocolFees, computeDelta, PROTOCOLS };
