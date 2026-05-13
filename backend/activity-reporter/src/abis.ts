/**
 * Minimal ABIs for the AgentRegistry and each protocol contract.
 * Only includes the events/functions we need.
 */

export const AgentRegistryABI = [
  'function recordActivity(address agent, string protocol, uint256 volume, uint256 fees) external',
  'function recordPnL(address agent, uint256 amount, bool positive) external',
  'function authorizedReporters(address) view returns (bool)',
  'function addReporter(address reporter) external',
  'function admin() view returns (address)',
  'function isRegistered(address) view returns (bool)',
  'function totalTrades() view returns (uint256)',
  'function totalAgents() view returns (uint256)',
  'event ActivityRecorded(address indexed agent, string protocol, uint256 volume, uint256 fees, uint256 ubiShare)',
  'event AgentRegistered(address indexed agent, string name, address indexed owner)',
];

export const GoodSwapRouterABI = [
  'event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed to)',
];

export const PerpEngineABI = [
  'event PositionOpened(address indexed trader, uint256 indexed marketId, bool isLong, uint256 size, uint256 margin, uint256 entryPrice)',
  'event PositionClosed(address indexed trader, uint256 indexed marketId, int256 pnl, uint256 exitPrice)',
  'event PositionLiquidated(address indexed liquidator, address indexed trader, uint256 indexed marketId, uint256 exitPrice)',
];

export const GoodLendPoolABI = [
  'event Supply(address indexed asset, address indexed user, uint256 amount)',
  'event Borrow(address indexed asset, address indexed user, uint256 amount)',
  'event Repay(address indexed asset, address indexed user, uint256 amount)',
  'event Liquidation(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtCovered, uint256 collateralLiquidated)',
];

export const MarketFactoryABI = [
  'event Bought(uint256 indexed marketId, address indexed buyer, bool isYES, uint256 amount, uint256 cost)',
  'event Redeemed(uint256 indexed marketId, address indexed redeemer, uint256 amount, uint256 payout)',
];

export const CollateralVaultABI = [
  'event Minted(address indexed user, bytes32 indexed ticker, uint256 syntheticAmount, uint256 collateralUsed, uint256 fee)',
  'event Burned(address indexed user, bytes32 indexed ticker, uint256 syntheticAmount, uint256 collateralReturned, uint256 fee)',
];
