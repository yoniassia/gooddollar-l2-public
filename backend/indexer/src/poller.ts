/**
 * Block poller — fetches logs from all indexed contracts and stores them.
 * Uses ethers.js getLogs with topic filtering for efficiency.
 */
import { ethers, JsonRpcProvider, Interface, Log } from "ethers";
import { IndexerDB, IndexedEvent } from "./db";
import { ContractDef, getAllContracts } from "./contracts";

const MAX_BLOCK_RANGE = 2000; // max blocks per getLogs call

interface ParsedContract {
  def: ContractDef;
  iface: Interface;
  topicSets: string[][]; // topic0 values for each event
}

export class Poller {
  private provider: JsonRpcProvider;
  private db: IndexerDB;
  private parsed: ParsedContract[];
  private running = false;
  private pollInterval: number;

  constructor(rpcUrl: string, db: IndexerDB, pollIntervalMs = 2000) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.db = db;
    this.pollInterval = pollIntervalMs;

    // Parse all contracts
    this.parsed = getAllContracts().map((def) => {
      const iface = new Interface(def.events);
      const topicSets = def.events.map((evtSig) => {
        const fragment = iface.getEvent(evtSig.replace(/^event\s+/, "").split("(")[0]);
        return fragment ? [iface.getEvent(fragment.name)!.topicHash] : [];
      });
      return { def, iface, topicSets };
    });
  }

  async start() {
    this.running = true;
    console.log(`[Poller] Starting — ${this.parsed.length} contracts, poll every ${this.pollInterval}ms`);

    while (this.running) {
      try {
        await this.poll();
      } catch (err: any) {
        console.error(`[Poller] Error:`, err.message);
      }
      await sleep(this.pollInterval);
    }
  }

  stop() {
    this.running = false;
  }

  private async poll() {
    const lastBlock = this.db.getLastBlock();
    const currentBlock = await this.provider.getBlockNumber();

    if (currentBlock <= lastBlock) return;

    const fromBlock = lastBlock + 1;
    const toBlock = Math.min(currentBlock, fromBlock + MAX_BLOCK_RANGE - 1);

    // Fetch logs for each contract
    const allEvents: IndexedEvent[] = [];

    for (const pc of this.parsed) {
      // Combine all topic0s for this contract in one call
      const topic0s = pc.topicSets.flat();
      if (topic0s.length === 0) continue;

      try {
        const logs = await this.provider.getLogs({
          address: pc.def.address,
          topics: [topic0s.length === 1 ? topic0s[0] : topic0s],
          fromBlock,
          toBlock,
        });

        for (const log of logs) {
          const parsed = this.parseLog(pc, log);
          if (parsed) allEvents.push(parsed);
        }
      } catch (err: any) {
        // Some contracts might not exist yet — skip silently
        if (!err.message?.includes("execution reverted")) {
          console.warn(`[Poller] getLogs failed for ${pc.def.name}: ${err.message}`);
        }
      }
    }

    // Also scan for wildcard events (lending, stable, swap — addresses discovered dynamically)
    // These use topic-only filtering across all addresses

    if (allEvents.length > 0) {
      // Batch-fetch timestamps for unique blocks
      const blockNums = [...new Set(allEvents.map((e) => e.block_number))];
      const timestamps = new Map<number, number>();
      for (const bn of blockNums) {
        try {
          const block = await this.provider.getBlock(bn);
          if (block) timestamps.set(bn, block.timestamp);
        } catch {
          timestamps.set(bn, Math.floor(Date.now() / 1000));
        }
      }

      // Attach timestamps
      for (const evt of allEvents) {
        evt.timestamp = timestamps.get(evt.block_number) ?? Math.floor(Date.now() / 1000);
      }

      this.db.insertEvents(allEvents);
      console.log(`[Poller] Indexed ${allEvents.length} events from blocks ${fromBlock}–${toBlock}`);
    }

    this.db.setLastBlock(toBlock);
  }

  private parseLog(pc: ParsedContract, log: Log): IndexedEvent | null {
    try {
      const parsed = pc.iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed) return null;

      // Serialize args — convert BigInts to strings
      const args: Record<string, any> = {};
      for (const [key, val] of Object.entries(parsed.args)) {
        if (/^\d+$/.test(key)) continue; // skip positional
        args[key] = typeof val === "bigint" ? val.toString() : val;
      }

      return {
        block_number: log.blockNumber,
        tx_hash: log.transactionHash,
        log_index: log.index,
        contract_name: pc.def.name,
        contract_address: pc.def.address,
        protocol: pc.def.protocol,
        event_name: parsed.name,
        args_json: JSON.stringify(args),
        timestamp: 0, // filled in later
      };
    } catch {
      return null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
