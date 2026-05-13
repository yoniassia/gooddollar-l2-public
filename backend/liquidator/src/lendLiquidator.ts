/**
 * GoodLend Liquidator
 *
 * Monitors GoodLendPool for undercollateralized borrowers and executes
 * liquidations when health factor < 1.0 (< 1e27 in RAY).
 *
 * Strategy:
 *   1. Scan Supply/Borrow events to build a set of active borrowers
 *   2. Check each borrower's health factor via getUserAccountData()
 *   3. If HF < 1.0 → pick the best collateral/debt pair and liquidate
 *   4. Profit = liquidation bonus (typically 5%) minus gas costs
 */

import { ethers } from 'ethers'
import { CONFIG } from './config'
import { GoodLendPoolABI, ERC20ABI, SimplePriceOracleABI } from './abis'

const RAY = BigInt('1000000000000000000000000000') // 1e27

export class LendLiquidator {
  private provider: ethers.JsonRpcProvider
  private wallet: ethers.Wallet
  private pool: ethers.Contract
  private oracle: ethers.Contract
  private borrowers: Set<string> = new Set()
  private assets: string[]

  constructor() {
    this.provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl)
    this.wallet = new ethers.Wallet(CONFIG.privateKey, this.provider)
    this.pool = new ethers.Contract(CONFIG.goodLendPool, GoodLendPoolABI, this.wallet)
    this.oracle = new ethers.Contract(CONFIG.goodLendOracle, SimplePriceOracleABI, this.provider)
    this.assets = CONFIG.lendAssets
  }

  /** Scan past Borrow events to find all borrowers. */
  async scanBorrowers(): Promise<void> {
    try {
      const filter = this.pool.filters.Borrow()
      const events = await this.pool.queryFilter(filter, 0, 'latest')
      for (const event of events) {
        const parsed = this.pool.interface.parseLog({
          topics: event.topics as string[],
          data: event.data,
        })
        if (parsed?.args?.user) {
          this.borrowers.add(parsed.args.user)
        }
      }
      console.log(`[LendLiquidator] Found ${this.borrowers.size} borrowers`)
    } catch (err) {
      console.error('[LendLiquidator] Failed to scan borrowers:', err)
    }
  }

  /** Check all known borrowers and liquidate if possible. */
  async checkAndLiquidate(): Promise<number> {
    let liquidationCount = 0

    for (const user of this.borrowers) {
      try {
        const [healthFactor, totalCollateral, totalDebt] =
          await this.pool.getUserAccountData(user)

        const hf = BigInt(healthFactor.toString())
        if (hf >= RAY || totalDebt === 0n) continue

        console.log(
          `[LendLiquidator] ⚠️  User ${user} is liquidatable! HF=${ethers.formatUnits(hf, 27)}, debt=${totalDebt}`,
        )

        // Find the best collateral/debt pair
        const result = await this.findBestLiquidation(user)
        if (!result) {
          console.log(`[LendLiquidator] No profitable liquidation found for ${user}`)
          continue
        }

        const { collateralAsset, debtAsset, debtToCover } = result

        // Approve debt token spending
        const debtToken = new ethers.Contract(debtAsset, ERC20ABI, this.wallet)
        const currentAllowance = await debtToken.allowance(
          this.wallet.address,
          CONFIG.goodLendPool,
        )
        if (BigInt(currentAllowance.toString()) < BigInt(debtToCover.toString())) {
          const approveTx = await debtToken.approve(
            CONFIG.goodLendPool,
            ethers.MaxUint256,
          )
          await approveTx.wait()
          console.log(`[LendLiquidator] Approved ${debtAsset} for pool`)
        }

        // Execute liquidation
        const tx = await this.pool.liquidate(
          collateralAsset,
          debtAsset,
          user,
          debtToCover,
        )
        const receipt = await tx.wait()
        console.log(
          `[LendLiquidator] ✅ Liquidated ${user} — tx: ${receipt.hash}, gas: ${receipt.gasUsed}`,
        )
        liquidationCount++
      } catch (err) {
        console.error(`[LendLiquidator] Error checking user ${user}:`, err)
      }
    }

    return liquidationCount
  }

  /** Find the most profitable collateral/debt pair to liquidate. */
  private async findBestLiquidation(
    user: string,
  ): Promise<{ collateralAsset: string; debtAsset: string; debtToCover: bigint } | null> {
    let bestCollateral = ''
    let bestDebt = ''
    let bestDebtAmount = 0n

    for (const debtAsset of this.assets) {
      const debtReserve = await this.pool.reserves(debtAsset)
      if (!debtReserve.isActive) continue

      const debtTokenContract = new ethers.Contract(debtReserve.debtToken, ERC20ABI, this.provider)
      const userDebt = await debtTokenContract.balanceOf(user)
      if (userDebt === 0n) continue

      // Check if liquidator has enough debt tokens to cover
      const liquidatorBalance = await new ethers.Contract(
        debtAsset,
        ERC20ABI,
        this.provider,
      ).balanceOf(this.wallet.address)

      // Cover up to 50% of debt (close factor) or liquidator balance
      const maxCover = userDebt / 2n
      const debtToCover = liquidatorBalance < maxCover ? liquidatorBalance : maxCover
      if (debtToCover === 0n) continue

      for (const collateralAsset of this.assets) {
        if (collateralAsset === debtAsset) continue
        const collateralReserve = await this.pool.reserves(collateralAsset)
        if (!collateralReserve.isActive) continue

        const gTokenContract = new ethers.Contract(collateralReserve.gToken, ERC20ABI, this.provider)
        const userCollateral = await gTokenContract.balanceOf(user)
        if (userCollateral === 0n) continue

        // This pair is viable — pick the one with most debt
        if (debtToCover > bestDebtAmount) {
          bestCollateral = collateralAsset
          bestDebt = debtAsset
          bestDebtAmount = debtToCover
        }
      }
    }

    if (!bestCollateral || !bestDebt || bestDebtAmount === 0n) return null

    return {
      collateralAsset: bestCollateral,
      debtAsset: bestDebt,
      debtToCover: bestDebtAmount,
    }
  }

  /** Subscribe to new Borrow events in real-time. */
  listenForNewBorrowers(): void {
    this.pool.on('Borrow', (_asset: string, user: string) => {
      if (!this.borrowers.has(user)) {
        this.borrowers.add(user)
        console.log(`[LendLiquidator] New borrower detected: ${user}`)
      }
    })
  }
}
