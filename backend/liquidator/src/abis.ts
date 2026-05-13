/**
 * Minimal ABIs for the liquidation bot.
 * Only the functions we call / read are included to keep the binary small.
 */

export const GoodLendPoolABI = [
  // Read user account data (returns health factor, total collateral, total debt)
  'function getUserAccountData(address user) view returns (uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValue)',
  // Liquidate an undercollateralized position
  'function liquidate(address collateralAsset, address debtAsset, address user, uint256 debtToCover)',
  // Read reserve config for an asset
  'function reserves(address asset) view returns (address gToken, address debtToken, uint256 reserveFactorBPS, uint256 ltvBPS, uint256 liquidationThresholdBPS, uint256 liquidationBonusBPS, uint256 supplyCap, uint256 borrowCap, uint8 decimals, bool isActive, bool borrowingEnabled, uint256 liquidityIndex, uint256 variableBorrowIndex, uint256 currentLiquidityRate, uint256 currentVariableBorrowRate, uint40 lastUpdateTimestamp)',
  // Events
  'event Liquidation(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 collateralSeized, address liquidator)',
  'event Supply(address indexed asset, address indexed user, uint256 amount)',
  'event Borrow(address indexed asset, address indexed user, uint256 amount)',
] as const

export const VaultManagerABI = [
  // Read vault info
  'function vaults(address user, bytes32 ilk) view returns (uint256 collateral, uint256 debt)',
  // Liquidate a vault
  'function liquidate(address user, bytes32 ilk)',
  // Events
  'event VaultOpened(address indexed user, bytes32 indexed ilk)',
  'event VaultLiquidated(address indexed user, bytes32 indexed ilk, uint256 collateralSeized, uint256 debtRepaid)',
] as const

export const CollateralRegistryABI = [
  'function ilkCount() view returns (uint256)',
  'function ilkList(uint256 index) view returns (bytes32)',
  'function getConfig(bytes32 ilk) view returns (tuple(address token, uint256 liquidationRatio, uint256 liquidationPenalty, uint256 debtCeiling, uint256 stabilityFeeRate, bool active))',
] as const

export const SimplePriceOracleABI = [
  'function getAssetPrice(address asset) view returns (uint256)',
] as const

export const ERC20ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const
