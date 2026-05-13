export const GoodDollarTokenABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const MarketFactoryABI = [
  {
    inputs: [
      { name: 'question', type: 'string' },
      { name: 'endTime', type: 'uint256' },
      { name: 'resolver', type: 'address' },
    ],
    name: 'createMarket',
    outputs: [{ name: 'marketId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'isYES', type: 'bool' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'buy',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'redeem',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'getMarket',
    outputs: [
      { name: 'question', type: 'string' },
      { name: 'endTime', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'totalYES', type: 'uint256' },
      { name: 'totalNO', type: 'uint256' },
      { name: 'collateral', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'marketCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'impliedProbabilityYES',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const ConditionalTokensABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'yesTokenId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'noTokenId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
] as const

export const UBIFeeHookABI = [
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'calculateUBIFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ubiFeeShareBPS',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSwapsProcessed',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'totalUBIFees',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── GoodLendPool ABI (core lending operations) ───────────────────────────────
export const GoodLendPoolABI = [
  // supply
  {
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'supply',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // withdraw
  {
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'withdraw',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // borrow
  {
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'borrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // repay
  {
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'repay',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // liquidate
  {
    inputs: [
      { name: 'collateralAsset', type: 'address' },
      { name: 'debtAsset', type: 'address' },
      { name: 'user', type: 'address' },
      { name: 'debtToCover', type: 'uint256' },
    ],
    name: 'liquidate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // getUserAccountData
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserAccountData',
    outputs: [
      { name: 'healthFactor', type: 'uint256' },
      { name: 'totalCollateralUSD', type: 'uint256' },
      { name: 'totalDebtUSD', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // getReserveData
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getReserveData',
    outputs: [
      { name: 'totalDeposits', type: 'uint256' },
      { name: 'totalBorrows', type: 'uint256' },
      { name: 'liquidityIndex', type: 'uint256' },
      { name: 'borrowIndex', type: 'uint256' },
      { name: 'supplyRate', type: 'uint256' },
      { name: 'borrowRate', type: 'uint256' },
      { name: 'accruedToTreasury', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // reserves mapping (public)
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'reserves',
    outputs: [
      { name: 'gToken', type: 'address' },
      { name: 'debtToken', type: 'address' },
      { name: 'reserveFactorBPS', type: 'uint256' },
      { name: 'ltvBPS', type: 'uint256' },
      { name: 'liquidationThresholdBPS', type: 'uint256' },
      { name: 'liquidationBonusBPS', type: 'uint256' },
      { name: 'supplyCap', type: 'uint256' },
      { name: 'borrowCap', type: 'uint256' },
      { name: 'decimals', type: 'uint8' },
      { name: 'isActive', type: 'bool' },
      { name: 'borrowingEnabled', type: 'bool' },
      { name: 'liquidityIndex', type: 'uint256' },
      { name: 'variableBorrowIndex', type: 'uint256' },
      { name: 'currentBorrowRate', type: 'uint256' },
      { name: 'currentSupplyRate', type: 'uint256' },
      { name: 'lastUpdateTimestamp', type: 'uint40' },
      { name: 'accruedToTreasury', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'asset', type: 'address' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'Supply',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'asset', type: 'address' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'Withdraw',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'asset', type: 'address' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'Borrow',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'asset', type: 'address' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'Repay',
    type: 'event',
  },
] as const

// ─── PerpEngine ABI (open/close positions, read markets + positions) ──────────
export const PerpEngineABI = [
  {
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'size', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'minPrice', type: 'uint256' },
    ],
    name: 'openPosition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'closePosition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'markets',
    outputs: [
      { name: 'key', type: 'bytes32' },
      { name: 'maxLeverage', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'marketCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }, { name: 'marketId', type: 'uint256' }],
    name: 'positions',
    outputs: [
      { name: 'size', type: 'uint256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'collateral', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }, { name: 'marketId', type: 'uint256' }],
    name: 'marginRatio',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }, { name: 'marketId', type: 'uint256' }],
    name: 'unrealizedPnL',
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── CollateralVault ABI (mint/burn synthetic assets, manage collateral) ──────
export const CollateralVaultABI = [
  {
    inputs: [{ name: 'ticker', type: 'string' }, { name: 'amount', type: 'uint256' }],
    name: 'depositCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'ticker', type: 'string' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'syntheticAmount', type: 'uint256' },
    ],
    name: 'depositAndMint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'ticker', type: 'string' },
      { name: 'syntheticAmount', type: 'uint256' },
      { name: 'additionalCollateral', type: 'uint256' },
    ],
    name: 'getMintRequirements',
    outputs: [
      { name: 'requiredCollateral', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'available', type: 'uint256' },
      { name: 'canMint', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'ticker', type: 'string' }, { name: 'amount', type: 'uint256' }],
    name: 'withdrawCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'ticker', type: 'string' }, { name: 'amount', type: 'uint256' }],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'ticker', type: 'string' }, { name: 'amount', type: 'uint256' }],
    name: 'burn',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }, { name: 'ticker', type: 'string' }],
    name: 'getPosition',
    outputs: [
      { name: 'userCollateral', type: 'uint256' },
      { name: 'userDebt', type: 'uint256' },
      { name: 'ratio', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }, { name: 'ticker', type: 'string' }],
    name: 'getCollateralRatio',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    type: 'event',
    name: 'Minted',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'ticker', type: 'bytes32', indexed: true },
      { name: 'syntheticAmount', type: 'uint256', indexed: false },
      { name: 'collateralUsed', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Burned',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'ticker', type: 'bytes32', indexed: true },
      { name: 'syntheticAmount', type: 'uint256', indexed: false },
      { name: 'collateralReturned', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
] as const

// ─── SyntheticAssetFactory ABI (list/get synthetic assets) ───────────────────
export const SyntheticAssetFactoryABI = [
  {
    inputs: [{ name: 'ticker', type: 'string' }],
    name: 'getAsset',
    outputs: [{ name: 'tokenAddress', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'key', type: 'bytes32' }],
    name: 'keyToTicker',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'listedCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'index', type: 'uint256' }],
    name: 'listedKeys',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── MarginVault ABI (deposit / withdraw / balances) ─────────────────────────
export const MarginVaultABI = [
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── FundingRate ABI (read cumulative index + last funding time) ─────────────
export const FundingRateABI = [
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'cumulativeFundingIndex',
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'lastFundingTime',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'FUNDING_INTERVAL',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── ERC20 minimal ABI (approve + allowance + balanceOf) ─────────────────────
export const ERC20ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── GoodLend PriceOracle (Aave-style: getAssetPrice(address) → uint256, 8 dec) ─

export const GoodLendPriceOracleABI = [
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getAssetPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── GoodStocks PriceOracle ───────────────────────────────────────────────────

export const PriceOracleABI = [
  {
    inputs: [{ name: 'ticker', type: 'string' }],
    name: 'getPrice',
    outputs: [{ name: 'price', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'ticker', type: 'string' }],
    name: 'hasFeed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'maxAge',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── GoodStable — VaultManager ────────────────────────────────────────────────

export const VaultManagerABI = [
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }, { name: 'owner', type: 'address' }],
    name: 'vaults',
    outputs: [
      { name: 'collateral', type: 'uint256' },
      { name: 'normalizedDebt', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }],
    name: 'accumulators',
    outputs: [
      { name: 'chi', type: 'uint256' },
      { name: 'lastDrip', type: 'uint256' },
      { name: 'totalNormalizedDebt', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }, { name: 'owner', type: 'address' }],
    name: 'vaultDebt',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }],
    name: 'openVault',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }, { name: 'amount', type: 'uint256' }],
    name: 'depositCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }, { name: 'amount', type: 'uint256' }],
    name: 'withdrawCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }, { name: 'amount', type: 'uint256' }],
    name: 'mintGUSD',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }, { name: 'amount', type: 'uint256' }],
    name: 'repayGUSD',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }],
    name: 'closeVault',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// ─── GoodStable — CollateralRegistry ─────────────────────────────────────────

export const CollateralRegistryABI = [
  {
    inputs: [{ name: 'ilk', type: 'bytes32' }],
    name: 'getConfig',
    outputs: [
      {
        components: [
          { name: 'token', type: 'address' },
          { name: 'liquidationRatio', type: 'uint256' },
          { name: 'liquidationPenalty', type: 'uint256' },
          { name: 'debtCeiling', type: 'uint256' },
          { name: 'stabilityFeeRate', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ilkCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'ilkList',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── GoodPool (x*y=k AMM) ABI ──────────────────────────────────────────────
export const GoodPoolABI = [
  {
    inputs: [],
    name: 'tokenA',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'tokenB',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'reserveA',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'reserveB',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalLiquidity',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'liquidity',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'spotPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    name: 'getAmountOut',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minOut', type: 'uint256' },
    ],
    name: 'swap',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
    name: 'addLiquidity',
    outputs: [{ name: 'lp', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'lpAmount', type: 'uint256' }],
    name: 'removeLiquidity',
    outputs: [
      { name: 'outA', type: 'uint256' },
      { name: 'outB', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'trader', type: 'address' },
      { indexed: false, name: 'tokenIn', type: 'address' },
      { indexed: false, name: 'amountIn', type: 'uint256' },
      { indexed: false, name: 'amountOut', type: 'uint256' },
      { indexed: false, name: 'fee', type: 'uint256' },
    ],
    name: 'Swap',
    type: 'event',
  },
] as const

export const GoodSwapRouterABI = [
  {
    inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }],
    name: 'getAmountOut',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }],
    name: 'getAmountIn',
    outputs: [{ name: 'amountIn', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }],
    name: 'getPool',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'amountInMax', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapTokensForExactTokens',
    outputs: [{ name: 'amountIn', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'tokenIn', type: 'address' },
      { indexed: true, name: 'tokenOut', type: 'address' },
      { indexed: false, name: 'amountIn', type: 'uint256' },
      { indexed: false, name: 'amountOut', type: 'uint256' },
      { indexed: true, name: 'to', type: 'address' },
    ],
    name: 'Swap',
    type: 'event',
  },
] as const

// ── VoteEscrowedGD ABI ──────────────────────────────────────────────────────
export const VoteEscrowedGDABI = [
  { inputs: [{ name: '_gd', type: 'address' }, { name: '_ubiTreasury', type: 'address' }, { name: '_admin', type: 'address' }], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ name: 'amount', type: 'uint256' }, { name: 'duration', type: 'uint256' }], name: 'lock', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'addedAmount', type: 'uint256' }], name: 'increaseLock', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'newEnd', type: 'uint256' }], name: 'extendLock', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'withdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'earlyUnlock', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'delegatee', type: 'address' }], name: 'delegate', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'votingPowerOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'getVotes', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }, { name: 'timestamp', type: 'uint256' }], name: 'getPastVotes', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalVotingPower', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalLocked', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'locks', outputs: [{ name: 'amount', type: 'uint128' }, { name: 'end', type: 'uint128' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'delegates', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'MAX_LOCK', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'MIN_LOCK', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'gd', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'user', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }, { indexed: false, name: 'unlockTime', type: 'uint256' }], name: 'Locked', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'user', type: 'address' }, { indexed: false, name: 'received', type: 'uint256' }, { indexed: false, name: 'penalty', type: 'uint256' }, { indexed: false, name: 'toUBI', type: 'uint256' }], name: 'EarlyUnlocked', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'user', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], name: 'Withdrawn', type: 'event' },
] as const

// ── GoodDAO ABI ──────────────────────────────────────────────────────────────
export const GoodDAOABI = [
  { inputs: [{ name: '_veGD', type: 'address' }, { name: '_guardian', type: 'address' }], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ name: 'targets', type: 'address[]' }, { name: 'values', type: 'uint256[]' }, { name: 'calldatas', type: 'bytes[]' }, { name: 'description', type: 'string' }], name: 'propose', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'proposalId', type: 'uint256' }, { name: 'support', type: 'uint8' }], name: 'castVote', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'proposalId', type: 'uint256' }], name: 'queue', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'proposalId', type: 'uint256' }], name: 'execute', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'proposalId', type: 'uint256' }], name: 'cancel', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'proposalId', type: 'uint256' }], name: 'state', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'proposalCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'uint256' }], name: 'proposals', outputs: [{ name: 'id', type: 'uint256' }, { name: 'proposer', type: 'address' }, { name: 'description', type: 'string' }, { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }, { name: 'executionTime', type: 'uint256' }, { name: 'forVotes', type: 'uint256' }, { name: 'againstVotes', type: 'uint256' }, { name: 'abstainVotes', type: 'uint256' }, { name: 'canceled', type: 'bool' }, { name: 'executed', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }], name: 'receipts', outputs: [{ name: 'hasVoted', type: 'bool' }, { name: 'support', type: 'uint8' }, { name: 'votes', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'veGD', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'guardian', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'VOTING_DELAY', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'VOTING_PERIOD', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'TIMELOCK_DELAY', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'PROPOSAL_THRESHOLD_BPS', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'QUORUM_BPS', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }, { indexed: true, name: 'proposer', type: 'address' }, { indexed: false, name: 'description', type: 'string' }], name: 'ProposalCreated', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'voter', type: 'address' }, { indexed: true, name: 'proposalId', type: 'uint256' }, { indexed: false, name: 'support', type: 'uint8' }, { indexed: false, name: 'votes', type: 'uint256' }], name: 'VoteCast', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }, { indexed: false, name: 'executionTime', type: 'uint256' }], name: 'ProposalQueued', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }], name: 'ProposalExecuted', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' }], name: 'ProposalCanceled', type: 'event' },
] as const

export const TestRegistryABI = [
  {
    type: 'function',
    name: 'getResultCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getResult',
    inputs: [{ name: 'resultId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'tester', type: 'address' },
          { name: 'contractTested', type: 'address' },
          { name: 'functionSelector', type: 'bytes4' },
          { name: 'success', type: 'bool' },
          { name: 'gasUsed', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'note', type: 'string' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getResults',
    inputs: [
      { name: 'from', type: 'uint256' },
      { name: 'to', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'results',
        type: 'tuple[]',
        components: [
          { name: 'tester', type: 'address' },
          { name: 'contractTested', type: 'address' },
          { name: 'functionSelector', type: 'bytes4' },
          { name: 'success', type: 'bool' },
          { name: 'gasUsed', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'note', type: 'string' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getResultsByTester',
    inputs: [{ name: 'tester', type: 'address' }],
    outputs: [
      {
        name: 'matches',
        type: 'tuple[]',
        components: [
          { name: 'tester', type: 'address' },
          { name: 'contractTested', type: 'address' },
          { name: 'functionSelector', type: 'bytes4' },
          { name: 'success', type: 'bool' },
          { name: 'gasUsed', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'note', type: 'string' },
        ],
      },
      { name: 'ids', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'TestResultLogged',
    inputs: [
      { name: 'resultId', type: 'uint256', indexed: true },
      { name: 'tester', type: 'address', indexed: true },
      { name: 'contractTested', type: 'address', indexed: true },
      { name: 'functionSelector', type: 'bytes4', indexed: false },
      { name: 'success', type: 'bool', indexed: false },
      { name: 'gasUsed', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
      { name: 'note', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
] as const

// ── UBI Revenue Tracker (GOO-226) ─────────────────────────────────────────────

export const UBIRevenueTrackerABI = [
  {
    type: 'function',
    name: 'getDashboardData',
    inputs: [],
    outputs: [
      { name: '_totalFees', type: 'uint256' },
      { name: '_totalUBI', type: 'uint256' },
      { name: '_totalTx', type: 'uint256' },
      { name: '_protocolCount', type: 'uint256' },
      { name: '_activeProtocols', type: 'uint256' },
      { name: '_splitterFees', type: 'uint256' },
      { name: '_splitterUBI', type: 'uint256' },
      { name: '_snapshotCount', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllProtocols',
    inputs: [],
    outputs: [
      {
        name: 'result',
        type: 'tuple[]',
        components: [
          { name: 'name', type: 'string' },
          { name: 'category', type: 'string' },
          { name: 'feeSource', type: 'address' },
          { name: 'totalFees', type: 'uint256' },
          { name: 'ubiContribution', type: 'uint256' },
          { name: 'txCount', type: 'uint256' },
          { name: 'lastUpdateBlock', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSnapshots',
    inputs: [{ name: 'count', type: 'uint256' }],
    outputs: [
      {
        name: 'result',
        type: 'tuple[]',
        components: [
          { name: 'timestamp', type: 'uint256' },
          { name: 'totalUBI', type: 'uint256' },
          { name: 'totalFees', type: 'uint256' },
          { name: 'protocolCount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'protocolCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'snapshotCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalFeesTracked',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalUBITracked',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalTxTracked',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// ─── VaultFactory ABI (GoodYield) ─────────────────────────────────────────────
export const VaultFactoryABI = [
  {
    type: 'function',
    name: 'allVaults',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalTVL',
    inputs: [],
    outputs: [{ name: 'tvl', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalUBIFunded',
    inputs: [],
    outputs: [{ name: 'total', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isVault',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getVaultsByAsset',
    inputs: [{ name: '_asset', type: 'address' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approvedStrategies',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

// ─── GoodVault ABI (ERC-4626 Yield Vault) ────────────────────────────────────
export const GoodVaultABI = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'asset',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalAssets',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'convertToShares',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'convertToAssets',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxDeposit',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'previewDeposit',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'previewWithdraw',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'redeem',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'harvest',
    inputs: [],
    outputs: [
      { name: 'profit', type: 'uint256' },
      { name: 'loss', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'strategy',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'depositCap',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalDebt',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'performanceFeeBPS',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'managementFeeBPS',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalGainSinceInception',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalUBIFunded',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'paused',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'lastReport',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  // ERC-20 approve (needed for deposit)
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const
