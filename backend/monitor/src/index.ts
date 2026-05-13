/**
 * GoodDollar L2 Monitor — continuous health monitoring with REST API.
 *
 * Runs periodic checks on chain, contracts, and services.
 * Exposes results via API on port 4201.
 *
 * Endpoints:
 *   GET /api/health     — latest check results
 *   GET /api/history    — check history (last 100 runs)
 *   GET /api/alerts     — active alerts (warn/error results)
 */
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import {
  CheckResult,
  checkChainRPC,
  checkChainBalance,
  checkContract,
  checkHTTPService,
  checkExplorer,
} from "./checks";

const RPC = process.env.RPC_URL || "http://localhost:8545";
const EXPLORER = process.env.EXPLORER_URL || "https://explorer.goodclaw.org";
const PORT = parseInt(process.env.MONITOR_PORT || "4201", 10);
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_MS || "30000", 10);
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const CONTRACTS: [string, string][] = [
  ["GoodDollarToken", "0x5FbDB2315678afecb367f032d93F642f64180aa3"],
  ["UBIFeeSplitter", "0xC0BF43A4Ca27e0976195E6661b099742f10507e5"],
  ["PerpEngine", "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"],
  ["MarginVault", "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"],
  ["MarketFactory", "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"],
  ["ConditionalTokens", "0x8aCd85898458400f7Db866d53FCFF6f0D49741FF"],
  ["SyntheticAssetFactory", "0x610178dA211FEF7D417bC0e6FeD39F05609AD788"],
  ["CollateralVault", "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e"],
];

const SERVICES: [string, string][] = [
  ["Indexer API", "http://localhost:4200/api/health"],
];

// State
let latestResults: CheckResult[] = [];
let lastCheckTime = 0;
const history: { timestamp: number; results: CheckResult[] }[] = [];

async function runAllChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Chain
  results.push(await checkChainRPC(RPC));
  results.push(await checkChainBalance(RPC, DEPLOYER, "Deployer"));

  // Contracts (parallel)
  const contractChecks = await Promise.all(
    CONTRACTS.map(([name, addr]) => checkContract(RPC, name, addr))
  );
  results.push(...contractChecks);

  // Services (parallel)
  const serviceChecks = await Promise.all(
    SERVICES.map(([name, url]) => checkHTTPService(url, name))
  );
  results.push(...serviceChecks);

  // Explorer
  results.push(await checkExplorer(EXPLORER));

  return results;
}

async function checkLoop() {
  while (true) {
    try {
      latestResults = await runAllChecks();
      lastCheckTime = Date.now();

      // Store in history (keep last 100)
      history.push({ timestamp: lastCheckTime, results: latestResults });
      if (history.length > 100) history.shift();

      const errors = latestResults.filter((r) => r.status === "error");
      const warns = latestResults.filter((r) => r.status === "warn");

      if (errors.length > 0) {
        console.log(`[Monitor] ❌ ${errors.length} errors: ${errors.map((e) => e.name).join(", ")}`);
      } else if (warns.length > 0) {
        console.log(`[Monitor] ⚠️ ${warns.length} warnings: ${warns.map((w) => w.name).join(", ")}`);
      } else {
        console.log(`[Monitor] ✅ All ${latestResults.length} checks passed`);
      }
    } catch (err: any) {
      console.error(`[Monitor] Check loop error:`, err.message);
    }

    await new Promise((r) => setTimeout(r, CHECK_INTERVAL));
  }
}

// API
const app = express();
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/api/health", (_req, res) => {
  const ok = latestResults.filter((r) => r.status === "ok").length;
  const warn = latestResults.filter((r) => r.status === "warn").length;
  const err = latestResults.filter((r) => r.status === "error").length;

  res.json({
    ok: err === 0,
    service: "gooddollar-monitor",
    lastCheck: lastCheckTime ? new Date(lastCheckTime).toISOString() : null,
    summary: { ok, warn, error: err, total: latestResults.length },
    results: latestResults,
  });
});

app.get("/api/history", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  res.json({
    ok: true,
    count: Math.min(limit, history.length),
    data: history.slice(-limit).reverse(),
  });
});

app.get("/api/alerts", (_req, res) => {
  const alerts = latestResults.filter((r) => r.status !== "ok");
  res.json({ ok: true, count: alerts.length, alerts });
});

app.listen(PORT, () => {
  console.log(`[Monitor] GoodDollar L2 Monitor API on port ${PORT}`);
});

// Start check loop
checkLoop();
