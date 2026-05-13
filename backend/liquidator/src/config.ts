/**
 * Liquidator bot configuration.
 *
 * Reads from environment variables with sensible devnet defaults.
 */
export const CONFIG = {
  /** JSON-RPC endpoint */
  rpcUrl: process.env.RPC_URL ?? 'http://localhost:8545',

  /** Private key for the liquidator EOA (Anvil default deployer) */
  privateKey:
    process.env.PRIVATE_KEY ??
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',

  /** Polling interval in ms */
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5_000),

  /** Minimum profit threshold (in ETH terms) to execute a liquidation */
  minProfitEth: Number(process.env.MIN_PROFIT_ETH ?? 0),

  // ─── GoodLend addresses ──────────────────────────────────────────────────
  goodLendPool:
    process.env.GOODLEND_POOL ?? '0x322813fd9a801c5507c9de605d63cea4f2ce6c44',
  goodLendOracle:
    process.env.GOODLEND_ORACLE ?? '0x9a9f2ccfde556a7e9ff0848998aa4a0cfd8863ae',

  /** GoodLend reserve assets to monitor */
  lendAssets: (process.env.LEND_ASSETS ?? '').split(',').filter(Boolean).length
    ? (process.env.LEND_ASSETS ?? '').split(',').filter(Boolean)
    : [
        '0x5FbDB2315678afecb367f032d93F642f64180aa3', // G$
        '0x0b306bf915c4d645ff596e518faf3f9669b97016', // MockUSDC
        '0x959922be3caee4b8cd9a407cc3ac1c251c2007b1', // MockWETH
      ],

  // ─── GoodStable addresses ────────────────────────────────────────────────
  vaultManager:
    process.env.VAULT_MANAGER ?? '0x5eb3bc0a489c5a8288765d2336659ebca68fcd00',
  collateralRegistry:
    process.env.COLLATERAL_REGISTRY ?? '0x9d4454b023096f34b160d6b654540c56a1f81688',
  gUSD: process.env.GUSD ?? '0x0e801d84fa97b50751dbf25036d067dcf18858bf',
} as const
