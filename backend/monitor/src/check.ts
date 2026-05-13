#!/usr/bin/env ts-node
/**
 * CLI one-shot health check — run with: npm run check
 *
 * Runs all checks and prints a summary table.
 */
import dotenv from "dotenv";
dotenv.config();

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
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// Contract addresses from op-stack/addresses.json
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

// Backend services
const SERVICES: [string, string][] = [
  ["Indexer API", "http://localhost:4200/api/health"],
  ["Frontend", "http://localhost:3000"],
];

function statusIcon(status: string): string {
  return status === "ok" ? "✅" : status === "warn" ? "⚠️" : "❌";
}

async function main() {
  console.log("\n🔍 GoodDollar L2 Health Check\n");
  console.log("=".repeat(70));

  const results: CheckResult[] = [];

  // Chain
  console.log("\n📡 Chain");
  const rpc = await checkChainRPC(RPC);
  results.push(rpc);
  console.log(`  ${statusIcon(rpc.status)} ${rpc.message} (${rpc.latencyMs}ms)`);

  const bal = await checkChainBalance(RPC, DEPLOYER, "Deployer");
  results.push(bal);
  console.log(`  ${statusIcon(bal.status)} ${bal.message}`);

  // Contracts
  console.log("\n📦 Contracts");
  for (const [name, addr] of CONTRACTS) {
    const r = await checkContract(RPC, name, addr);
    results.push(r);
    console.log(`  ${statusIcon(r.status)} ${name}: ${r.message}`);
  }

  // Services
  console.log("\n🌐 Services");
  for (const [name, url] of SERVICES) {
    const r = await checkHTTPService(url, name);
    results.push(r);
    console.log(`  ${statusIcon(r.status)} ${name}: ${r.message}`);
  }

  const explorer = await checkExplorer(EXPLORER);
  results.push(explorer);
  console.log(`  ${statusIcon(explorer.status)} Explorer: ${explorer.message}`);

  // Summary
  console.log("\n" + "=".repeat(70));
  const ok = results.filter((r) => r.status === "ok").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const err = results.filter((r) => r.status === "error").length;
  console.log(`\n📊 Summary: ${ok} ok, ${warn} warnings, ${err} errors (${results.length} total)\n`);

  if (err > 0) process.exit(1);
  if (warn > 0) process.exit(0);
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(2);
});
