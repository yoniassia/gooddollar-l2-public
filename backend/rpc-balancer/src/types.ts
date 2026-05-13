/** RPC upstream node configuration */
export interface UpstreamConfig {
  /** Unique name for this upstream */
  name: string;
  /** RPC URL (http/https/ws) */
  url: string;
  /** Max requests per second (0 = unlimited) */
  rateLimit: number;
  /** Priority weight for load balancing (higher = more traffic) */
  weight: number;
  /** Whether this is a read-only replica or supports write (sendTransaction) */
  readOnly: boolean;
  /** Max concurrent in-flight requests */
  maxConcurrent: number;
}

/** Runtime health state for an upstream */
export interface UpstreamState {
  config: UpstreamConfig;
  healthy: boolean;
  latencyMs: number;
  lastCheck: number;
  consecutiveFailures: number;
  requestsInFlight: number;
  requestsTotal: number;
  errorsTotal: number;
  /** Sliding window of recent latencies (ms) for p50/p95/p99 */
  latencyWindow: number[];
}

/** JSON-RPC request */
export interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: any[];
  id: number | string;
}

/** JSON-RPC response */
export interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

/** Balancer metrics snapshot */
export interface BalancerMetrics {
  totalRequests: number;
  totalErrors: number;
  upstreams: {
    name: string;
    url: string;
    healthy: boolean;
    latencyMs: number;
    p50Ms: number;
    p95Ms: number;
    requestsTotal: number;
    errorsTotal: number;
    requestsInFlight: number;
  }[];
}

/** Write methods that need a non-readOnly upstream */
export const WRITE_METHODS = new Set([
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTransaction',
  'eth_signTypedData_v4',
]);
