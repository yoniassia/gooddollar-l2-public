/**
 * GoodDollar L2 Event Indexer
 *
 * A lightweight event indexer for all GoodDollar L2 protocols.
 * Polls the chain for events, stores in SQLite, serves via REST API.
 *
 * Protocols indexed:
 *   - core (GoodDollarToken, UBIFeeSplitter)
 *   - perps (PerpEngine, MarginVault, FundingRate)
 *   - predict (MarketFactory, ConditionalTokens)
 *   - stocks (SyntheticAssetFactory, CollateralVault)
 *   - lending (GoodLendPool — via wildcard topic scanning)
 *   - stable (VaultManager, PSM — via wildcard topic scanning)
 *   - swap (GoodSwapRouter, pools — via wildcard topic scanning)
 */
import dotenv from "dotenv";
dotenv.config();

import { IndexerDB } from "./db";
import { Poller } from "./poller";
import { createAPI } from "./api";

async function main() {
  const rpcUrl = process.env.RPC_URL || "http://localhost:8545";
  const dbPath = process.env.DB_PATH || "./data/indexer.db";
  const port = parseInt(process.env.PORT || "4200", 10);
  const pollInterval = parseInt(process.env.POLL_INTERVAL_MS || "2000", 10);

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   GoodDollar L2 Event Indexer v0.1.0        ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  RPC:    ${rpcUrl.padEnd(35)} ║`);
  console.log(`║  DB:     ${dbPath.padEnd(35)} ║`);
  console.log(`║  API:    http://localhost:${port.toString().padEnd(19)} ║`);
  console.log(`║  Poll:   ${(pollInterval + "ms").padEnd(35)} ║`);
  console.log("╚══════════════════════════════════════════════╝");

  // Initialize DB
  const db = new IndexerDB(dbPath);
  console.log(`[DB] Initialized, last block: ${db.getLastBlock()}`);

  // Start API server
  createAPI(db, port);

  // Start poller
  const poller = new Poller(rpcUrl, db, pollInterval);

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[Indexer] Shutting down...");
    poller.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Begin indexing
  await poller.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
