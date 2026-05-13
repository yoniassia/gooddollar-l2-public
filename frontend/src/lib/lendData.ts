/**
 * GoodLend mock data — mirrors GoodLendPool.sol reserve structure.
 * All values are demo/devnet placeholders.
 */

export interface LendReserve {
  symbol: string
  name: string
  address: string          // devnet contract address
  decimals: number
  price: number            // USD
  // Supply side
  totalSupplied: number    // in underlying units
  supplyAPY: number        // e.g. 0.042 = 4.2%
  // Borrow side
  totalBorrowed: number
  borrowAPY: number
  // Config
  ltvBPS: number           // e.g. 7500 = 75%
  liquidationThresholdBPS: number
  liquidationBonusBPS: number
  reserveFactorBPS: number
  isActive: boolean
  borrowingEnabled: boolean
  // gToken
  gTokenSymbol: string
}

export interface UserPosition {
  asset: string            // reserve symbol
  supplied: number         // underlying amount
  borrowed: number
  supplyAPY: number
  borrowAPY: number
  price: number
}

export interface UserAccountData {
  positions: UserPosition[]
  totalCollateralUSD: number
  totalBorrowedUSD: number
  healthFactor: number     // 1e27 RAY-based, but normalised to float here
  netAPY: number
  availableToBorrowUSD: number
}

const RESERVES: LendReserve[] = [
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0xETH_DEVNET',
    decimals: 18,
    price: 3012.45,
    totalSupplied: 4_820,
    supplyAPY: 0.0185,
    totalBorrowed: 3_210,
    borrowAPY: 0.0320,
    ltvBPS: 8000,
    liquidationThresholdBPS: 8250,
    liquidationBonusBPS: 10500,
    reserveFactorBPS: 1500,
    isActive: true,
    borrowingEnabled: true,
    gTokenSymbol: 'gWETH',
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    address: '0xBTC_DEVNET',
    decimals: 8,
    price: 60125.80,
    totalSupplied: 285,
    supplyAPY: 0.0045,
    totalBorrowed: 112,
    borrowAPY: 0.0125,
    ltvBPS: 7000,
    liquidationThresholdBPS: 7500,
    liquidationBonusBPS: 11000,
    reserveFactorBPS: 2000,
    isActive: true,
    borrowingEnabled: true,
    gTokenSymbol: 'gWBTC',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xUSDC_DEVNET',
    decimals: 6,
    price: 1.00,
    totalSupplied: 12_400_000,
    supplyAPY: 0.0624,
    totalBorrowed: 9_850_000,
    borrowAPY: 0.0890,
    ltvBPS: 7500,
    liquidationThresholdBPS: 8000,
    liquidationBonusBPS: 10500,
    reserveFactorBPS: 1000,
    isActive: true,
    borrowingEnabled: true,
    gTokenSymbol: 'gUSDC',
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0xDAI_DEVNET',
    decimals: 18,
    price: 1.00,
    totalSupplied: 6_200_000,
    supplyAPY: 0.0580,
    totalBorrowed: 4_120_000,
    borrowAPY: 0.0810,
    ltvBPS: 7500,
    liquidationThresholdBPS: 8000,
    liquidationBonusBPS: 10500,
    reserveFactorBPS: 1000,
    isActive: true,
    borrowingEnabled: true,
    gTokenSymbol: 'gDAI',
  },
  {
    symbol: 'G$',
    name: 'GoodDollar',
    address: '0xGD_DEVNET',
    decimals: 18,
    price: 0.0102,
    totalSupplied: 980_000_000,
    supplyAPY: 0.1240,
    totalBorrowed: 420_000_000,
    borrowAPY: 0.1980,
    ltvBPS: 5000,
    liquidationThresholdBPS: 6500,
    liquidationBonusBPS: 11500,
    reserveFactorBPS: 3300,
    isActive: true,
    borrowingEnabled: true,
    gTokenSymbol: 'gG$',
  },
]

export function getReserves(): LendReserve[] {
  return RESERVES
}

export function getReserveBySymbol(symbol: string): LendReserve | undefined {
  return RESERVES.find(r => r.symbol === symbol)
}

export function getAvailableLiquidity(reserve: LendReserve): number {
  return reserve.totalSupplied - reserve.totalBorrowed
}

export function getUtilizationRate(reserve: LendReserve): number {
  if (reserve.totalSupplied === 0) return 0
  return reserve.totalBorrowed / reserve.totalSupplied
}

/** Demo user positions (wallet connected simulation) */
export function getUserAccountData(): UserAccountData {
  const positions: UserPosition[] = [
    { asset: 'WETH', supplied: 1.5, borrowed: 0, supplyAPY: 0.0185, borrowAPY: 0.0320, price: 3012.45 },
    { asset: 'USDC', supplied: 2_500, borrowed: 1_200, supplyAPY: 0.0624, borrowAPY: 0.0890, price: 1.00 },
  ]

  const totalCollateralUSD = positions.reduce((acc, p) => acc + p.supplied * p.price, 0)
  const totalBorrowedUSD = positions.reduce((acc, p) => acc + p.borrowed * p.price, 0)

  // health factor: sum(collateral_i * liqThreshold_i) / totalDebt
  // Simplified: use 80% avg liquidation threshold
  const weightedThreshold = 0.80
  const healthFactor = totalBorrowedUSD === 0
    ? Infinity
    : (totalCollateralUSD * weightedThreshold) / totalBorrowedUSD

  const supplyIncome = positions.reduce((acc, p) => acc + p.supplied * p.price * p.supplyAPY, 0)
  const borrowCost = positions.reduce((acc, p) => acc + p.borrowed * p.price * p.borrowAPY, 0)
  const netAPY = totalCollateralUSD > 0
    ? (supplyIncome - borrowCost) / totalCollateralUSD
    : 0

  // Max borrow: 75% LTV on collateral minus existing debt
  const maxBorrowUSD = totalCollateralUSD * 0.75 - totalBorrowedUSD

  return {
    positions,
    totalCollateralUSD,
    totalBorrowedUSD,
    healthFactor,
    netAPY,
    availableToBorrowUSD: Math.max(0, maxBorrowUSD),
  }
}

export function formatAPY(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`
}

export function formatUSD(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

export function formatHealthFactor(hf: number): string {
  if (!isFinite(hf)) return '∞'
  return hf.toFixed(2)
}

export function healthFactorColor(hf: number): string {
  if (!isFinite(hf) || hf >= 2) return 'text-green-400'
  if (hf >= 1.5) return 'text-goodgreen'
  if (hf >= 1.2) return 'text-yellow-400'
  return 'text-red-400'
}
