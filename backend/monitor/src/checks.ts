/**
 * Health checks for GoodDollar L2 infrastructure.
 *
 * Each check returns a CheckResult with status (ok/warn/error), message, and optional data.
 */
import { JsonRpcProvider, Contract } from "ethers";

export type CheckStatus = "ok" | "warn" | "error";

export interface CheckResult {
  name: string;
  category: string;
  status: CheckStatus;
  message: string;
  data?: Record<string, any>;
  latencyMs?: number;
}

// ── Chain checks ────────────────────────────────────────────────────
export async function checkChainRPC(rpcUrl: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const [blockNumber, network] = await Promise.all([
      provider.getBlockNumber(),
      provider.getNetwork(),
    ]);
    const block = await provider.getBlock(blockNumber);
    const latency = Date.now() - start;

    const blockAge = block ? Math.floor(Date.now() / 1000) - block.timestamp : Infinity;

    let status: CheckStatus = "ok";
    let message = `Block ${blockNumber}, chain ${network.chainId}`;

    if (blockAge > 60) {
      status = "warn";
      message += ` — last block ${blockAge}s ago (stale?)`;
    }
    if (blockAge > 300) {
      status = "error";
      message += " — chain may be halted";
    }

    return {
      name: "Chain RPC",
      category: "chain",
      status,
      message,
      data: { blockNumber, chainId: Number(network.chainId), blockAge, blockTimestamp: block?.timestamp },
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      name: "Chain RPC",
      category: "chain",
      status: "error",
      message: `RPC unreachable: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

export async function checkChainBalance(rpcUrl: string, address: string, label: string, minEth = 0.1): Promise<CheckResult> {
  const start = Date.now();
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    const ethBalance = Number(balance) / 1e18;
    const latency = Date.now() - start;

    let status: CheckStatus = "ok";
    let message = `${label}: ${ethBalance.toFixed(4)} ETH`;

    if (ethBalance < minEth) {
      status = "warn";
      message += ` — below threshold (${minEth} ETH)`;
    }
    if (ethBalance === 0) {
      status = "error";
      message += " — empty!";
    }

    return { name: `Balance: ${label}`, category: "chain", status, message, data: { address, ethBalance }, latencyMs: latency };
  } catch (err: any) {
    return { name: `Balance: ${label}`, category: "chain", status: "error", message: err.message, latencyMs: Date.now() - start };
  }
}

// ── Contract checks ─────────────────────────────────────────────────
export async function checkContract(rpcUrl: string, name: string, address: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const code = await provider.getCode(address);
    const latency = Date.now() - start;

    if (code === "0x" || code === "0x0") {
      return { name: `Contract: ${name}`, category: "contracts", status: "error", message: `No code at ${address}`, latencyMs: latency };
    }

    return {
      name: `Contract: ${name}`,
      category: "contracts",
      status: "ok",
      message: `Deployed (${code.length / 2 - 1} bytes)`,
      data: { address, codeSize: code.length / 2 - 1 },
      latencyMs: latency,
    };
  } catch (err: any) {
    return { name: `Contract: ${name}`, category: "contracts", status: "error", message: err.message, latencyMs: Date.now() - start };
  }
}

// ── Service checks ──────────────────────────────────────────────────
export async function checkHTTPService(url: string, name: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    const body = await res.json().catch(() => null) as Record<string, any> | null;

    if (!res.ok) {
      return { name: `Service: ${name}`, category: "services", status: "error", message: `HTTP ${res.status}`, data: body ?? undefined, latencyMs: latency };
    }

    let status: CheckStatus = "ok";
    if (latency > 2000) status = "warn";

    return {
      name: `Service: ${name}`,
      category: "services",
      status,
      message: `HTTP ${res.status} — ${latency}ms`,
      data: body ?? undefined,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      name: `Service: ${name}`,
      category: "services",
      status: "error",
      message: `Unreachable: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

// ── Blockscout check ────────────────────────────────────────────────
export async function checkExplorer(explorerUrl: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${explorerUrl}/api/v2/stats`, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;

    if (!res.ok) {
      return { name: "Explorer (Blockscout)", category: "services", status: "warn", message: `HTTP ${res.status}`, latencyMs: latency };
    }

    const data = await res.json().catch(() => ({})) as Record<string, any>;
    return {
      name: "Explorer (Blockscout)",
      category: "services",
      status: "ok",
      message: `Online — ${data.total_blocks || "?"} blocks indexed`,
      data: data as Record<string, any>,
      latencyMs: latency,
    };
  } catch (err: any) {
    return { name: "Explorer (Blockscout)", category: "services", status: "error", message: err.message, latencyMs: Date.now() - start };
  }
}
