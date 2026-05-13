export type TokenCategory = 'DeFi' | 'Stablecoins' | 'Layer 2' | 'Infrastructure' | 'GoodDollar'

export interface Token {
  symbol: string
  name: string
  decimals: number
  popular?: boolean
  category: TokenCategory
}

export const TOKEN_CATEGORIES: TokenCategory[] = ['DeFi', 'Stablecoins', 'Layer 2', 'Infrastructure', 'GoodDollar']

export const TOKENS: Token[] = [
  { symbol: 'G$', name: 'GoodDollar', decimals: 18, popular: true, category: 'GoodDollar' },
  { symbol: 'ETH', name: 'Ether', decimals: 18, popular: true, category: 'Infrastructure' },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6, popular: true, category: 'Stablecoins' },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8, popular: true, category: 'Infrastructure' },
  { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, popular: true, category: 'Stablecoins' },
  { symbol: 'USDT', name: 'Tether USD', decimals: 6, popular: true, category: 'Stablecoins' },
  { symbol: 'LINK', name: 'Chainlink', decimals: 18, category: 'Infrastructure' },
  { symbol: 'UNI', name: 'Uniswap', decimals: 18, category: 'DeFi' },
  { symbol: 'AAVE', name: 'Aave', decimals: 18, category: 'DeFi' },
  { symbol: 'ARB', name: 'Arbitrum', decimals: 18, category: 'Layer 2' },
  { symbol: 'OP', name: 'Optimism', decimals: 18, category: 'Layer 2' },
  { symbol: 'MKR', name: 'Maker', decimals: 18, category: 'DeFi' },
  { symbol: 'COMP', name: 'Compound', decimals: 18, category: 'DeFi' },
  { symbol: 'SNX', name: 'Synthetix', decimals: 18, category: 'DeFi' },
  { symbol: 'CRV', name: 'Curve DAO', decimals: 18, category: 'DeFi' },
  { symbol: 'LDO', name: 'Lido DAO', decimals: 18, category: 'DeFi' },
  { symbol: 'MATIC', name: 'Polygon', decimals: 18, category: 'Layer 2' },
  { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, category: 'Infrastructure' },
]

export const POPULAR_TOKENS = TOKENS.filter(t => t.popular)

export const TOKEN_COLORS: Record<string, string> = {
  'G$': '#00B0A0',
  'ETH': '#627EEA',
  'USDC': '#2775CA',
  'WBTC': '#F7931A',
  'DAI': '#F5AC37',
  'USDT': '#26A17B',
  'LINK': '#2A5ADA',
  'UNI': '#FF007A',
  'AAVE': '#B6509E',
  'ARB': '#28A0F0',
  'OP': '#FF0420',
  'MKR': '#1AAB9B',
  'COMP': '#00D395',
  'SNX': '#170659',
  'CRV': '#FD2700',
  'LDO': '#00A3FF',
  'MATIC': '#8247E5',
  'WETH': '#627EEA',
}
