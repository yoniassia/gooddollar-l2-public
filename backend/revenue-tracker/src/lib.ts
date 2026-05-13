/**
 * Revenue Tracker — Pure functions and configuration (testable without side effects).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProtocolConfig {
  id: number;
  name: string;
  category: string;
  contracts: { address: string; abi: string[]; feeField?: string; txField?: string }[];
}

export interface FeeReport {
  protocolId: number;
  name: string;
  totalFees: bigint;
  ubiPortion: bigint;
  txCount: bigint;
}

// ─── Protocol Configuration ──────────────────────────────────────────────────

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

export const PROTOCOLS: ProtocolConfig[] = [
  {
    id: 0, name: 'GoodSwap', category: 'swap',
    contracts: [
      { address: '0xA4899D35897033b927acFCf422bc745916139776', abi: SWAP_POOL_ABI, feeField: 'totalFees', txField: 'swapCount' },
      { address: '0xf953b3A269d80e3eB0F2947630Da976B896A8C5b', abi: SWAP_POOL_ABI, feeField: 'totalFees', txField: 'swapCount' },
      { address: '0xAA292E8611aDF267e563f334Ee42320aC96D0463', abi: SWAP_POOL_ABI, feeField: 'totalFees', txField: 'swapCount' },
    ],
  },
  { id: 1, name: 'GoodPerps', category: 'perps', contracts: [{ address: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853', abi: PERP_ENGINE_ABI, feeField: 'totalFeesPaid', txField: 'positionCount' }] },
  { id: 2, name: 'GoodPredict', category: 'predict', contracts: [{ address: '0xc7cDb7A2E5dDa1B7A0E792Fe1ef08ED20A6F56D4', abi: MARKET_FACTORY_ABI, txField: 'marketCount' }] },
  { id: 3, name: 'GoodLend', category: 'lend', contracts: [{ address: '0x322813fd9a801c5507c9de605d63cea4f2ce6c44', abi: LEND_POOL_ABI, feeField: 'totalInterestPaid' }] },
  { id: 4, name: 'GoodStable', category: 'stable', contracts: [{ address: '0xe039608E695D21aB11675EBBA00261A0e750526c', abi: VAULT_MANAGER_ABI, feeField: 'totalStabilityFees' }] },
  { id: 5, name: 'GoodStocks', category: 'stocks', contracts: [{ address: '0xd9140951d8aE6E5F625a02F5908535e16e3af964', abi: SYNTHETIC_FACTORY_ABI, feeField: 'totalFees' }] },
  { id: 6, name: 'GoodBridge', category: 'bridge', contracts: [] },
];

// ─── Delta Computation ───────────────────────────────────────────────────────

const lastReported = new Map<number, { fees: bigint; txs: bigint }>();

/**
 * Compute delta from last reported values.
 * Only report incremental changes (not cumulative totals).
 */
export function computeDelta(report: FeeReport): { fees: bigint; ubi: bigint; txs: bigint } | null {
  const last = lastReported.get(report.protocolId);

  if (!last) {
    if (report.totalFees === 0n && report.txCount === 0n) return null;
    return { fees: report.totalFees, ubi: report.ubiPortion, txs: report.txCount };
  }

  const feesDelta = report.totalFees > last.fees ? report.totalFees - last.fees : 0n;
  const txsDelta = report.txCount > last.txs ? report.txCount - last.txs : 0n;

  if (feesDelta === 0n && txsDelta === 0n) return null;

  const ubiDelta = (feesDelta * 33n) / 100n;
  return { fees: feesDelta, ubi: ubiDelta, txs: txsDelta };
}

/**
 * Calculate UBI portion of fees (33%).
 */
export function calcUBI(fees: bigint): bigint {
  return (fees * 33n) / 100n;
}

/**
 * Reset tracking state (for testing).
 */
export function resetLastReported(): void {
  lastReported.clear();
}

/**
 * Set last reported values (for testing / initialization).
 */
export function setLastReported(protocolId: number, fees: bigint, txs: bigint): void {
  lastReported.set(protocolId, { fees, txs });
}
