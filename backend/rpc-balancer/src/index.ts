import express from 'express';
import pino from 'pino';
import { UpstreamManager } from './upstream';
import { UpstreamConfig, JsonRpcRequest, BalancerMetrics } from './types';
import 'dotenv/config';

const logger = pino({ name: 'rpc-balancer' });

// --- Configuration ---
const PORT = parseInt(process.env.RPC_BALANCER_PORT || '8546', 10);

/** Parse upstream config from env or use defaults */
function loadUpstreams(): UpstreamConfig[] {
  const envUpstreams = process.env.RPC_UPSTREAMS;
  if (envUpstreams) {
    try {
      return JSON.parse(envUpstreams);
    } catch (e) {
      logger.warn('Failed to parse RPC_UPSTREAMS env, using defaults');
    }
  }

  // Default: single local Anvil node + optional replicas
  const upstreams: UpstreamConfig[] = [
    {
      name: 'anvil-primary',
      url: process.env.RPC_PRIMARY || 'http://localhost:8545',
      rateLimit: 0,
      weight: 10,
      readOnly: false,
      maxConcurrent: 100,
    },
  ];

  // Add replicas from env: RPC_REPLICA_1, RPC_REPLICA_2, etc.
  for (let i = 1; i <= 10; i++) {
    const url = process.env[`RPC_REPLICA_${i}`];
    if (!url) break;
    upstreams.push({
      name: `replica-${i}`,
      url,
      rateLimit: parseInt(process.env[`RPC_REPLICA_${i}_RATE_LIMIT`] || '50', 10),
      weight: parseInt(process.env[`RPC_REPLICA_${i}_WEIGHT`] || '5', 10),
      readOnly: process.env[`RPC_REPLICA_${i}_WRITABLE`] !== 'true',
      maxConcurrent: parseInt(process.env[`RPC_REPLICA_${i}_MAX_CONCURRENT`] || '50', 10),
    });
  }

  return upstreams;
}

// --- App ---
const upstreams = loadUpstreams();
const manager = new UpstreamManager(upstreams);
const app = express();

app.use(express.json({ limit: '1mb' }));

// Request counter
let totalRequests = 0;
let totalErrors = 0;

/** Main RPC proxy endpoint */
app.post('/', async (req, res) => {
  totalRequests++;

  const body = req.body;

  // Handle batch requests
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map((r: JsonRpcRequest) => handleSingleRequest(r)));
    res.json(results);
    return;
  }

  const result = await handleSingleRequest(body as JsonRpcRequest);
  res.json(result);
});

async function handleSingleRequest(rpcReq: JsonRpcRequest) {
  const upstream = manager.select(rpcReq);

  if (!upstream) {
    totalErrors++;
    logger.error({ method: rpcReq.method }, 'No healthy upstream available');
    return {
      jsonrpc: '2.0',
      id: rpcReq.id,
      error: { code: -32000, message: 'No healthy upstream available' },
    };
  }

  try {
    const result = await manager.forward(upstream, rpcReq);
    return result;
  } catch (err: any) {
    totalErrors++;
    logger.error({ upstream: upstream.config.name, method: rpcReq.method, err: err.message }, 'Upstream request failed, trying fallback');

    // Try next healthy upstream as fallback
    const fallback = manager.select(rpcReq);
    if (fallback && fallback.config.name !== upstream.config.name) {
      try {
        return await manager.forward(fallback, rpcReq);
      } catch (e2: any) {
        return {
          jsonrpc: '2.0',
          id: rpcReq.id,
          error: { code: -32000, message: `All upstreams failed: ${e2.message}` },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id: rpcReq.id,
      error: { code: -32000, message: `Upstream failed: ${err.message}` },
    };
  }
}

/** Metrics endpoint */
app.get('/metrics', (_req, res) => {
  const states = manager.getStates();
  const metrics: BalancerMetrics = {
    totalRequests,
    totalErrors,
    upstreams: states.map(s => {
      const sorted = [...s.latencyWindow].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      return {
        name: s.config.name,
        url: s.config.url,
        healthy: s.healthy,
        latencyMs: s.latencyMs,
        p50Ms: p50,
        p95Ms: p95,
        requestsTotal: s.requestsTotal,
        errorsTotal: s.errorsTotal,
        requestsInFlight: s.requestsInFlight,
      };
    }),
  };
  res.json(metrics);
});

/** Health endpoint */
app.get('/health', (_req, res) => {
  const states = manager.getStates();
  const anyHealthy = states.some(s => s.healthy);
  res.status(anyHealthy ? 200 : 503).json({
    status: anyHealthy ? 'ok' : 'degraded',
    upstreams: states.map(s => ({ name: s.config.name, healthy: s.healthy, latencyMs: s.latencyMs })),
  });
});

// Start
manager.start();
app.listen(PORT, () => {
  logger.info({ port: PORT, upstreams: upstreams.map(u => u.name) }, 'RPC load balancer started');
});

export { app, manager };
