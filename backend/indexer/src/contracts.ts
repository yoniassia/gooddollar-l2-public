/**
 * Contract addresses and event ABIs for all GoodDollar L2 protocols.
 * Each protocol defines its contracts and the events we want to index.
 */

export interface ContractDef {
  name: string;
  address: string;
  protocol: string;
  events: string[]; // event signature fragments for ethers Interface
}

// ── Core ──────────────────────────────────────────────────────────────
export const CORE_CONTRACTS: ContractDef[] = [
  {
    name: "GoodDollarToken",
    address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    protocol: "core",
    events: [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
      "event Approval(address indexed owner, address indexed spender, uint256 value)",
    ],
  },
  {
    name: "UBIFeeSplitter",
    address: "0xC0BF43A4Ca27e0976195E6661b099742f10507e5",
    protocol: "core",
    events: [
      "event FeeReceived(address indexed token, uint256 amount)",
      "event UBIDistributed(uint256 amount)",
    ],
  },
];

// ── Perps ─────────────────────────────────────────────────────────────
export const PERPS_CONTRACTS: ContractDef[] = [
  {
    name: "PerpEngine",
    address: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
    protocol: "perps",
    events: [
      "event PositionOpened(address indexed trader, uint256 indexed marketId, bool isLong, uint256 size, uint256 collateral, uint256 entryPrice)",
      "event PositionClosed(address indexed trader, uint256 indexed marketId, int256 pnl, uint256 exitPrice)",
      "event PositionLiquidated(address indexed trader, uint256 indexed marketId, address indexed liquidator, int256 pnl)",
      "event MarketCreated(uint256 indexed marketId, bytes32 oracleKey, uint256 maxLeverage)",
    ],
  },
  {
    name: "MarginVault",
    address: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    protocol: "perps",
    events: [
      "event Deposited(address indexed user, uint256 amount)",
      "event Withdrawn(address indexed user, uint256 amount)",
      "event EngineDebit(address indexed user, uint256 amount)",
    ],
  },
  {
    name: "FundingRate",
    address: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    protocol: "perps",
    events: [
      "event FundingApplied(uint256 indexed marketId, int256 rate, int256 newIndex, uint256 timestamp)",
    ],
  },
  {
    name: "PerpPriceOracle",
    address: "0x286B8DecD5ED79c962b2d8F4346CD97FF0E2C352",
    protocol: "perps",
    events: [
      "event PriceUpdated(bytes32 indexed key, uint256 markPrice, uint256 indexPrice, uint8 numSources, uint256 timestamp)",
      "event ManualPriceSet(bytes32 indexed key, uint256 markPrice, uint256 indexPrice)",
    ],
  },
];

// ── Predict ───────────────────────────────────────────────────────────
export const PREDICT_CONTRACTS: ContractDef[] = [
  {
    name: "MarketFactory",
    address: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
    protocol: "predict",
    events: [
      "event MarketCreated(uint256 indexed marketId, string question, uint256 endTime)",
      "event MarketResolved(uint256 indexed marketId, uint8 outcome)",
    ],
  },
  {
    name: "ConditionalTokens",
    address: "0x8aCd85898458400f7Db866d53FCFF6f0D49741FF",
    protocol: "predict",
    events: [
      "event PositionSplit(address indexed stakeholder, bytes32 indexed conditionId, uint256 amount)",
      "event PositionsMerge(address indexed stakeholder, bytes32 indexed conditionId, uint256 amount)",
      "event PayoutRedemption(address indexed redeemer, bytes32 indexed conditionId, uint256 payout)",
    ],
  },
];

// ── Stocks ────────────────────────────────────────────────────────────
export const STOCKS_CONTRACTS: ContractDef[] = [
  {
    name: "SyntheticAssetFactory",
    address: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
    protocol: "stocks",
    events: [
      "event SyntheticAssetCreated(address indexed asset, string ticker, string name)",
    ],
  },
  {
    name: "CollateralVault",
    address: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
    protocol: "stocks",
    events: [
      "event Deposited(address indexed user, address indexed asset, uint256 collateral, uint256 minted)",
      "event Redeemed(address indexed user, address indexed asset, uint256 burned, uint256 collateral)",
      "event Liquidated(address indexed user, address indexed asset, address indexed liquidator, uint256 debt, uint256 collateral)",
    ],
  },
];

// ── Lending ───────────────────────────────────────────────────────────
// Note: GoodLend addresses come from DeployGoodLend.s.sol run — these are
// discovered by scanning broadcast logs. We index common Aave-style events.
export const LENDING_EVENTS = [
  "event Supply(address indexed asset, address indexed user, uint256 amount)",
  "event Withdraw(address indexed asset, address indexed user, uint256 amount)",
  "event Borrow(address indexed asset, address indexed user, uint256 amount)",
  "event Repay(address indexed asset, address indexed user, uint256 amount)",
  "event Liquidation(address indexed collateral, address indexed debt, address indexed user, uint256 debtCovered, uint256 collateralSeized, address liquidator)",
  "event FlashLoan(address indexed asset, address indexed receiver, uint256 amount, uint256 premium)",
];

// ── Stable ────────────────────────────────────────────────────────────
export const STABLE_EVENTS = [
  "event VaultOpened(address indexed owner, bytes32 indexed ilk)",
  "event CollateralDeposited(address indexed owner, bytes32 indexed ilk, uint256 amount)",
  "event CollateralWithdrawn(address indexed owner, bytes32 indexed ilk, uint256 amount)",
  "event GUSDMinted(address indexed owner, bytes32 indexed ilk, uint256 amount)",
  "event GUSDRepaid(address indexed owner, bytes32 indexed ilk, uint256 amount)",
  "event VaultClosed(address indexed owner, bytes32 indexed ilk)",
  "event VaultLiquidated(address indexed owner, bytes32 indexed ilk, address indexed liquidator, uint256 debt, uint256 collateral)",
  "event SwapUSDCForGUSD(address indexed user, uint256 usdcIn, uint256 gusdOut, uint256 fee)",
  "event SwapGUSDForUSDC(address indexed user, uint256 gusdIn, uint256 usdcOut, uint256 fee)",
];

// ── Swap ──────────────────────────────────────────────────────────────
export const SWAP_EVENTS = [
  "event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
  "event LiquidityAdded(address indexed provider, address indexed pool, uint256 amount0, uint256 amount1)",
  "event LiquidityRemoved(address indexed provider, address indexed pool, uint256 amount0, uint256 amount1)",
];

// ── All contracts ─────────────────────────────────────────────────────
export function getAllContracts(): ContractDef[] {
  return [
    ...CORE_CONTRACTS,
    ...PERPS_CONTRACTS,
    ...PREDICT_CONTRACTS,
    ...STOCKS_CONTRACTS,
  ];
}
