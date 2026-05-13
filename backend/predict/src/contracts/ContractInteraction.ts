// ============================================================
// GoodPredict Contract Interaction Layer
// ============================================================
// Handles all interactions with GoodDollar L2 smart contracts:
// - MarketFactory.sol: Market creation, buying, resolution, redemption
// - ConditionalTokens.sol: ERC-1155 outcome token balances
// - UBIFeeSplitter.sol: Fee routing (1% redeem fee → UBI)
//
// The backend CLOB matches orders off-chain, then settles on-chain
// by executing buy() calls on behalf of matched traders.

import { ethers } from 'ethers';
import type { Market } from '../types/index.js';

// ABI fragments for MarketFactory
const MARKET_FACTORY_ABI = [
  // Market creation
  'function createMarket(string question, uint256 endTime, address resolver) external returns (uint256 marketId)',
  'function marketCount() external view returns (uint256)',
  'function getMarket(uint256 marketId) external view returns (string question, uint256 endTime, uint8 status, uint256 totalYES, uint256 totalNO, uint256 collateral)',
  'function impliedProbabilityYES(uint256 marketId) external view returns (uint256)',

  // Trading
  'function buy(uint256 marketId, bool isYES, uint256 amount) external',

  // Resolution
  'function closeMarket(uint256 marketId) external',
  'function resolve(uint256 marketId, bool yesWon) external',
  'function voidMarket(uint256 marketId) external',

  // Redemption
  'function redeem(uint256 marketId, uint256 amount) external',

  // State
  'function tokens() external view returns (address)',
  'function goodDollar() external view returns (address)',
  'function feeSplitter() external view returns (address)',
  'function admin() external view returns (address)',

  // Events
  'event MarketCreated(uint256 indexed marketId, string question, uint256 endTime, address resolver)',
  'event Bought(uint256 indexed marketId, address indexed buyer, bool isYES, uint256 amount, uint256 cost)',
  'event Redeemed(uint256 indexed marketId, address indexed redeemer, uint256 amount, uint256 payout)',
  'event MarketResolved(uint256 indexed marketId, uint8 result)',
  'event MarketVoided(uint256 indexed marketId)',
];

// ABI fragments for ConditionalTokens (ERC-1155)
const CONDITIONAL_TOKENS_ABI = [
  'function balanceOf(address owner, uint256 tokenId) external view returns (uint256)',
  'function balanceOfBatch(address[] owners, uint256[] ids) external view returns (uint256[])',
  'function yesTokenId(uint256 marketId) external pure returns (uint256)',
  'function noTokenId(uint256 marketId) external pure returns (uint256)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external',
  'function setApprovalForAll(address operator, bool approved) external',
  'function isApprovedForAll(address owner, address operator) external view returns (bool)',
];

// ABI for ERC-20 (GoodDollar token)
const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
];

export interface PredictContractAddresses {
  marketFactory: string;
  conditionalTokens: string;
  goodDollar: string;
  ubiFeeSplitter: string;
}

export interface OnChainMarketData {
  marketId: number;
  question: string;
  endTime: number;
  status: number;       // 0=Open, 1=Closed, 2=ResolvedYES, 3=ResolvedNO, 4=Voided
  totalYES: bigint;
  totalNO: bigint;
  collateral: bigint;
  impliedProbYES: number; // 0-10000 BPS
}

export interface SettlementResult {
  txHash: string;
  marketId: number;
  buyer: string;
  isYES: boolean;
  amount: string;
  gasUsed: string;
  blockNumber: number;
}

const STATUS_MAP: Record<number, string> = {
  0: 'OPEN',
  1: 'CLOSED',
  2: 'RESOLVED_YES',
  3: 'RESOLVED_NO',
  4: 'VOIDED',
};

export class PredictContractInteraction {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private marketFactory: ethers.Contract;
  private conditionalTokens: ethers.Contract;
  private goodDollar: ethers.Contract;
  private addresses: PredictContractAddresses;
  private nonce: number = 0;

  constructor(
    rpcUrl: string,
    privateKey: string,
    addresses: PredictContractAddresses,
  ) {
    this.addresses = addresses;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);

    this.marketFactory = new ethers.Contract(
      addresses.marketFactory,
      MARKET_FACTORY_ABI,
      this.signer,
    );
    this.conditionalTokens = new ethers.Contract(
      addresses.conditionalTokens,
      CONDITIONAL_TOKENS_ABI,
      this.signer,
    );
    this.goodDollar = new ethers.Contract(
      addresses.goodDollar,
      ERC20_ABI,
      this.signer,
    );
  }

  /**
   * Initialize — sync nonce and ensure token approvals.
   */
  async init(): Promise<void> {
    this.nonce = await this.provider.getTransactionCount(this.signer.address);

    // Ensure G$ approval for MarketFactory
    const allowance = await this.goodDollar.allowance(
      this.signer.address,
      this.addresses.marketFactory,
    );
    if (allowance < ethers.parseEther('1000000')) {
      console.log('[Contracts] Approving G$ for MarketFactory...');
      const tx = await this.goodDollar.approve(
        this.addresses.marketFactory,
        ethers.MaxUint256,
        { nonce: this.nonce++, gasLimit: 100000n },
      );
      await tx.wait(1);
      console.log('[Contracts] G$ approved');
    }

    console.log(`[Contracts] Initialized — operator: ${this.signer.address}, nonce: ${this.nonce}`);
  }

  // ============================================================
  // Market Creation
  // ============================================================

  /**
   * Create a new market on-chain.
   */
  async createMarket(
    question: string,
    endTime: number,
    resolver?: string,
  ): Promise<{ txHash: string; marketId: number }> {
    try {
      const resolverAddr = resolver || ethers.ZeroAddress;
      const tx = await this.marketFactory.createMarket(
        question,
        BigInt(endTime),
        resolverAddr,
        { nonce: this.nonce++, gasLimit: 500000n },
      );

      console.log(`[Contracts] createMarket tx: ${tx.hash}`);
      const receipt = await tx.wait(1);

      // Parse MarketCreated event to get marketId
      const event = receipt.logs
        .map((log: any) => {
          try { return this.marketFactory.interface.parseLog(log); }
          catch { return null; }
        })
        .find((e: any) => e?.name === 'MarketCreated');

      const marketId = event ? Number(event.args.marketId) : -1;
      console.log(`[Contracts] Market created on-chain: id=${marketId}, tx=${tx.hash}`);

      return { txHash: tx.hash, marketId };
    } catch (err: any) {
      console.error('[Contracts] createMarket failed:', err.message);
      this.nonce = await this.provider.getTransactionCount(this.signer.address);
      throw err;
    }
  }

  // ============================================================
  // Trade Settlement
  // ============================================================

  /**
   * Settle a matched trade by calling buy() on-chain.
   * The CLOB matches orders off-chain; this executes the on-chain settlement.
   *
   * In production, each trader would sign their own transactions.
   * For devnet, the operator executes on behalf of traders.
   */
  async settleBuy(
    marketId: number,
    isYES: boolean,
    amount: string,
    buyer: string,
  ): Promise<SettlementResult> {
    try {
      const amountWei = ethers.parseEther(amount);

      const tx = await this.marketFactory.buy(
        BigInt(marketId),
        isYES,
        amountWei,
        { nonce: this.nonce++, gasLimit: 300000n },
      );

      console.log(`[Contracts] buy tx: ${tx.hash} — market=${marketId}, ${isYES ? 'YES' : 'NO'}, amount=${amount}`);
      const receipt = await tx.wait(1);

      return {
        txHash: tx.hash,
        marketId,
        buyer,
        isYES,
        amount,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
      };
    } catch (err: any) {
      console.error(`[Contracts] buy failed: market=${marketId}`, err.message);
      this.nonce = await this.provider.getTransactionCount(this.signer.address);
      throw err;
    }
  }

  /**
   * Settle a batch of trades from the CLOB.
   * Groups buys by market and side, then executes on-chain.
   */
  async settleBatch(trades: Array<{
    marketId: number;
    isYES: boolean;
    amount: string;
    buyer: string;
  }>): Promise<SettlementResult[]> {
    const results: SettlementResult[] = [];
    for (const trade of trades) {
      try {
        const result = await this.settleBuy(
          trade.marketId,
          trade.isYES,
          trade.amount,
          trade.buyer,
        );
        results.push(result);
      } catch (err: any) {
        console.error(`[Contracts] Batch settlement failed for trade:`, trade, err.message);
        // Continue with remaining trades
      }
    }
    return results;
  }

  // ============================================================
  // Resolution
  // ============================================================

  /**
   * Close a market after its end time.
   */
  async closeMarket(marketId: number): Promise<string> {
    try {
      const tx = await this.marketFactory.closeMarket(
        BigInt(marketId),
        { nonce: this.nonce++, gasLimit: 200000n },
      );
      console.log(`[Contracts] closeMarket tx: ${tx.hash}`);
      await tx.wait(1);
      return tx.hash;
    } catch (err: any) {
      console.error(`[Contracts] closeMarket failed: market=${marketId}`, err.message);
      this.nonce = await this.provider.getTransactionCount(this.signer.address);
      throw err;
    }
  }

  /**
   * Resolve a market as YES or NO.
   */
  async resolveMarket(marketId: number, yesWon: boolean): Promise<string> {
    try {
      const tx = await this.marketFactory.resolve(
        BigInt(marketId),
        yesWon,
        { nonce: this.nonce++, gasLimit: 200000n },
      );
      console.log(`[Contracts] resolve tx: ${tx.hash} — market=${marketId}, yesWon=${yesWon}`);
      await tx.wait(1);
      return tx.hash;
    } catch (err: any) {
      console.error(`[Contracts] resolve failed: market=${marketId}`, err.message);
      this.nonce = await this.provider.getTransactionCount(this.signer.address);
      throw err;
    }
  }

  /**
   * Void a market (return collateral).
   */
  async voidMarket(marketId: number): Promise<string> {
    try {
      const tx = await this.marketFactory.voidMarket(
        BigInt(marketId),
        { nonce: this.nonce++, gasLimit: 200000n },
      );
      console.log(`[Contracts] voidMarket tx: ${tx.hash}`);
      await tx.wait(1);
      return tx.hash;
    } catch (err: any) {
      console.error(`[Contracts] voidMarket failed: market=${marketId}`, err.message);
      this.nonce = await this.provider.getTransactionCount(this.signer.address);
      throw err;
    }
  }

  // ============================================================
  // Read State
  // ============================================================

  /**
   * Get on-chain market data.
   */
  async getMarket(marketId: number): Promise<OnChainMarketData> {
    const [data, prob] = await Promise.all([
      this.marketFactory.getMarket(BigInt(marketId)),
      this.marketFactory.impliedProbabilityYES(BigInt(marketId)),
    ]);

    return {
      marketId,
      question: data[0],
      endTime: Number(data[1]),
      status: Number(data[2]),
      totalYES: data[3],
      totalNO: data[4],
      collateral: data[5],
      impliedProbYES: Number(prob),
    };
  }

  /**
   * Get on-chain market count.
   */
  async getMarketCount(): Promise<number> {
    return Number(await this.marketFactory.marketCount());
  }

  /**
   * Get a user's outcome token balance.
   */
  async getTokenBalance(
    user: string,
    marketId: number,
    isYES: boolean,
  ): Promise<string> {
    const tokenId = isYES ? marketId * 2 : marketId * 2 + 1;
    const balance = await this.conditionalTokens.balanceOf(user, BigInt(tokenId));
    return ethers.formatEther(balance);
  }

  /**
   * Get a user's G$ balance.
   */
  async getGoodDollarBalance(user: string): Promise<string> {
    const balance = await this.goodDollar.balanceOf(user);
    return ethers.formatEther(balance);
  }

  /**
   * Sync all on-chain markets into the resolver service.
   * Called on startup to populate the backend with existing markets.
   */
  async syncMarkets(): Promise<OnChainMarketData[]> {
    const count = await this.getMarketCount();
    const markets: OnChainMarketData[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const market = await this.getMarket(i);
        markets.push(market);
      } catch (err: any) {
        console.error(`[Contracts] Failed to sync market ${i}:`, err.message);
      }
    }

    console.log(`[Contracts] Synced ${markets.length} markets from chain`);
    return markets;
  }

  // ============================================================
  // Event Listeners
  // ============================================================

  /**
   * Listen for on-chain events.
   */
  onMarketCreated(callback: (marketId: number, question: string, endTime: number) => void): void {
    this.marketFactory.on('MarketCreated', (marketId: bigint, question: string, endTime: bigint) => {
      callback(Number(marketId), question, Number(endTime));
    });
  }

  onBought(callback: (marketId: number, buyer: string, isYES: boolean, amount: string) => void): void {
    this.marketFactory.on('Bought', (marketId: bigint, buyer: string, isYES: boolean, amount: bigint) => {
      callback(Number(marketId), buyer, isYES, ethers.formatEther(amount));
    });
  }

  onMarketResolved(callback: (marketId: number, status: string) => void): void {
    this.marketFactory.on('MarketResolved', (marketId: bigint, status: number) => {
      callback(Number(marketId), STATUS_MAP[status] || 'UNKNOWN');
    });
  }

  /**
   * Remove all event listeners.
   */
  removeAllListeners(): void {
    this.marketFactory.removeAllListeners();
  }
}
