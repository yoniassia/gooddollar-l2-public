/**
 * ActivityReporter — Core engine
 *
 * Polls protocol contracts for trading events (Swap, PositionOpened, Supply, etc.)
 * and calls AgentRegistry.recordActivity() to update on-chain agent stats.
 *
 * Architecture:
 *   1. For each protocol, create an ethers.Contract with its event ABI
 *   2. Every POLL_INTERVAL_MS, query getLogs from lastBlock+1 to latest
 *   3. Parse each log → extract (trader, volume, fee)
 *   4. Batch-call recordActivity on AgentRegistry
 *   5. Track lastProcessedBlock in memory (and optionally to disk)
 */

import { ethers, Contract, JsonRpcProvider, Wallet, Log, EventLog } from 'ethers';
import {
  ADDRESSES,
  PROTOCOLS,
  ProtocolDef,
  EventDef,
  RPC_URL,
  REPORTER_KEY,
  POLL_INTERVAL_MS,
  INITIAL_LOOKBACK,
} from './config';
import {
  AgentRegistryABI,
  GoodSwapRouterABI,
  PerpEngineABI,
  GoodLendPoolABI,
  MarketFactoryABI,
  CollateralVaultABI,
} from './abis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActivityRecord {
  protocol: string;
  trader: string;
  volume: bigint;
  fees: bigint;
  txHash: string;
  blockNumber: number;
  eventName: string;
}

export interface ReporterStats {
  totalReported: number;
  totalErrors: number;
  lastBlock: number;
  startedAt: number;
  protocols: Record<string, number>;
}

// ─── ABI Mapping ──────────────────────────────────────────────────────────────

const PROTOCOL_ABIS: Record<string, string[]> = {
  [ADDRESSES.GoodSwapRouter]: GoodSwapRouterABI,
  [ADDRESSES.PerpEngine]: PerpEngineABI,
  [ADDRESSES.GoodLendPool]: GoodLendPoolABI,
  [ADDRESSES.MarketFactory]: MarketFactoryABI,
  [ADDRESSES.CollateralVault]: CollateralVaultABI,
};

// ─── Reporter Class ───────────────────────────────────────────────────────────

export class ActivityReporter {
  private provider: JsonRpcProvider;
  private signer: Wallet;
  private registry: Contract;
  private protocolContracts: Map<string, Contract> = new Map();
  private lastBlock: number = 0;
  private running: boolean = false;
  private stats: ReporterStats;

  constructor(
    rpcUrl: string = RPC_URL,
    reporterKey: string = REPORTER_KEY,
  ) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.signer = new Wallet(reporterKey, this.provider);
    this.registry = new Contract(
      ADDRESSES.AgentRegistry,
      AgentRegistryABI,
      this.signer,
    );

    // Create contract instances for each protocol
    for (const proto of PROTOCOLS) {
      const abi = PROTOCOL_ABIS[proto.address];
      if (abi) {
        this.protocolContracts.set(
          proto.address,
          new Contract(proto.address, abi, this.provider),
        );
      }
    }

    this.stats = {
      totalReported: 0,
      totalErrors: 0,
      lastBlock: 0,
      startedAt: Date.now(),
      protocols: {},
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    console.log('🔍 ActivityReporter starting...');
    console.log(`   RPC: ${RPC_URL}`);
    console.log(`   Registry: ${ADDRESSES.AgentRegistry}`);
    console.log(`   Protocols: ${PROTOCOLS.map((p) => p.name).join(', ')}`);

    // Ensure we're authorized as a reporter
    await this.ensureReporter();

    // Set initial block
    const currentBlock = await this.provider.getBlockNumber();
    this.lastBlock = Math.max(0, currentBlock - INITIAL_LOOKBACK);
    console.log(
      `   Scanning from block ${this.lastBlock} (current: ${currentBlock})`,
    );

    this.running = true;
    this.poll();
  }

  stop(): void {
    this.running = false;
    console.log('🛑 ActivityReporter stopped');
  }

  getStats(): ReporterStats {
    return { ...this.stats, lastBlock: this.lastBlock };
  }

  // ─── Core Loop ────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        await this.scanAndReport();
      } catch (err: any) {
        console.error('❌ Poll error:', err.message);
        this.stats.totalErrors++;
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  async scanAndReport(): Promise<ActivityRecord[]> {
    const currentBlock = await this.provider.getBlockNumber();
    if (currentBlock <= this.lastBlock) return [];

    const fromBlock = this.lastBlock + 1;
    const toBlock = currentBlock;

    const allRecords: ActivityRecord[] = [];

    for (const proto of PROTOCOLS) {
      const contract = this.protocolContracts.get(proto.address);
      if (!contract) continue;

      for (const eventDef of proto.events) {
        try {
          const records = await this.scanProtocolEvent(
            proto,
            eventDef,
            contract,
            fromBlock,
            toBlock,
          );
          allRecords.push(...records);
        } catch (err: any) {
          console.error(
            `  ❌ Error scanning ${proto.name}/${eventDef.signature}:`,
            err.message,
          );
          this.stats.totalErrors++;
        }
      }
    }

    // Batch report to AgentRegistry
    if (allRecords.length > 0) {
      await this.batchReport(allRecords);
    }

    this.lastBlock = toBlock;
    this.stats.lastBlock = toBlock;

    return allRecords;
  }

  // ─── Event Scanning ───────────────────────────────────────────────────────

  private async scanProtocolEvent(
    proto: ProtocolDef,
    eventDef: EventDef,
    contract: Contract,
    fromBlock: number,
    toBlock: number,
  ): Promise<ActivityRecord[]> {
    // Get the event fragment from the contract interface
    const eventName = eventDef.signature.split('(')[0];
    const fragment = contract.interface.getEvent(eventName);
    if (!fragment) return [];

    const topicHash = contract.interface.getEvent(eventName)!.topicHash;

    // Query logs
    const logs = await this.provider.getLogs({
      address: proto.address,
      topics: [topicHash],
      fromBlock,
      toBlock,
    });

    const records: ActivityRecord[] = [];

    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (!parsed) continue;

        const trader = this.extractTrader(parsed, eventDef);
        const volume = this.extractVolume(parsed, eventDef);
        const fees = this.computeFees(parsed, eventDef, volume);

        if (trader && volume > 0n) {
          records.push({
            protocol: proto.name,
            trader,
            volume,
            fees,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            eventName: parsed.name,
          });
        }
      } catch (err: any) {
        // Skip unparseable logs
      }
    }

    return records;
  }

  private extractTrader(
    parsed: ethers.LogDescription,
    eventDef: EventDef,
  ): string {
    const val = parsed.args[eventDef.traderField];
    return typeof val === 'string' ? val : val?.toString() || '';
  }

  private extractVolume(
    parsed: ethers.LogDescription,
    eventDef: EventDef,
  ): bigint {
    const val = parsed.args[eventDef.volumeField];
    if (typeof val === 'bigint') return val;
    try {
      return BigInt(val.toString());
    } catch {
      return 0n;
    }
  }

  private computeFees(
    parsed: ethers.LogDescription,
    eventDef: EventDef,
    volume: bigint,
  ): bigint {
    // If there's a direct fee field in the event, use it
    if (eventDef.feeField) {
      const val = parsed.args[eventDef.feeField];
      if (typeof val === 'bigint') return val;
      try {
        return BigInt(val.toString());
      } catch {
        return 0n;
      }
    }

    // Otherwise, compute from feeBPS
    if (eventDef.feeBPS && eventDef.feeBPS > 0) {
      return (volume * BigInt(eventDef.feeBPS)) / 10000n;
    }

    return 0n;
  }

  // ─── Reporting ────────────────────────────────────────────────────────────

  private async batchReport(records: ActivityRecord[]): Promise<void> {
    console.log(`📊 Reporting ${records.length} activities to AgentRegistry...`);

    for (const record of records) {
      try {
        const tx = await this.registry.recordActivity(
          record.trader,
          record.protocol,
          record.volume,
          record.fees,
        );
        await tx.wait();

        this.stats.totalReported++;
        this.stats.protocols[record.protocol] =
          (this.stats.protocols[record.protocol] || 0) + 1;

        console.log(
          `  ✅ ${record.protocol}: ${record.eventName} by ${record.trader.slice(0, 10)}... vol=${ethers.formatEther(record.volume)} fees=${ethers.formatEther(record.fees)}`,
        );
      } catch (err: any) {
        console.error(
          `  ❌ Failed to report ${record.protocol}/${record.eventName}: ${err.message}`,
        );
        this.stats.totalErrors++;
      }
    }
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  private async ensureReporter(): Promise<void> {
    const myAddress = await this.signer.getAddress();
    const isReporter = await this.registry.authorizedReporters(myAddress);
    if (!isReporter) {
      console.log(`  🔑 Adding ${myAddress} as authorized reporter...`);
      const tx = await this.registry.addReporter(myAddress);
      await tx.wait();
      console.log(`  ✅ Reporter authorized`);
    } else {
      console.log(`  ✅ Already authorized as reporter`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
