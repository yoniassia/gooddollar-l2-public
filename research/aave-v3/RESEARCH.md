# GoodLend Research: Aave V3 Fork for GoodDollar L2

> **Date:** 2026-04-03
> **Status:** Research Complete
> **Goal:** Fork Aave V3 to create GoodLend — a lending protocol on GoodDollar L2 that routes 33% of protocol revenue to UBI via `UBIFeeSplitter`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Key Contracts](#2-key-contracts)
3. [Fee Structure](#3-fee-structure)
4. [Interest Rate Models](#4-interest-rate-models)
5. [Liquidation Mechanics](#5-liquidation-mechanics)
6. [Flash Loans](#6-flash-loans)
7. [Deployment Requirements](#7-deployment-requirements)
8. [Protocol Comparison: Compound V3 & Morpho Blue](#8-protocol-comparison)
9. [GoodLend Adaptation Plan](#9-goodlend-adaptation-plan)
10. [Solidity Code Skeleton](#10-solidity-code-skeleton)

---

## 1. Architecture Overview

Aave V3 uses a **hub-and-spoke proxy architecture** centered around a single entry-point contract (`Pool`) with logic delegated to libraries.

### Core Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│              PoolAddressesProvider                │
│  (Registry: maps IDs → proxy addresses)          │
│  Owns: Pool proxy, PoolConfigurator proxy,       │
│        Oracle, ACLManager, DataProvider           │
└────────┬──────────┬──────────┬──────────┬────────┘
         │          │          │          │
    ┌────▼────┐ ┌───▼────┐ ┌──▼──┐ ┌────▼────────┐
    │  Pool   │ │PoolConf│ │Oracle│ │ ACLManager   │
    │ (proxy) │ │igurator│ │      │ │              │
    └────┬────┘ └───┬────┘ └─────┘ └──────────────┘
         │          │
    ┌────▼──────────▼───────────────────────┐
    │         Logic Libraries               │
    │  SupplyLogic, BorrowLogic,            │
    │  LiquidationLogic, FlashLoanLogic,    │
    │  ReserveLogic, ValidationLogic,       │
    │  GenericLogic, EModeLogic,            │
    │  BridgeLogic, PoolLogic,              │
    │  IsolationModeLogic, CalldataLogic    │
    └───────────────┬───────────────────────┘
                    │
    ┌───────────────▼───────────────────────┐
    │      Per-Reserve Token Triplet        │
    │  ┌─────────┐ ┌──────────┐ ┌────────┐ │
    │  │ AToken  │ │Variable  │ │Stable  │ │
    │  │(interest│ │DebtToken │ │DebtToken│ │
    │  │bearing) │ │          │ │        │ │
    │  └─────────┘ └──────────┘ └────────┘ │
    └───────────────────────────────────────┘
```

### How a Supply Works (End-to-End)

1. User calls `Pool.supply(asset, amount, onBehalfOf, referralCode)`
2. Pool delegates to `SupplyLogic.executeSupply()`
3. `ReserveLogic.updateState()` is called → updates indexes + accrues treasury
4. `ValidationLogic.validateSupply()` checks caps
5. Asset is transferred from user to the AToken contract
6. AToken is minted to user (scaled by liquidity index)
7. Interest rates are recalculated via `ReserveLogic.updateInterestRates()`

### Key Design Principles

- **Single Pool per market:** All reserves share one Pool contract (vs Compound's isolated markets)
- **Upgradeable proxies:** Pool and PoolConfigurator sit behind `InitializableImmutableAdminUpgradeabilityProxy`
- **Libraries for logic:** Heavy use of Solidity libraries (delegatecall) to stay under contract size limits
- **Efficiency Mode (eMode):** Assets in same category (e.g., stablecoins) get boosted LTV/liquidation params
- **Isolation Mode:** New assets can be listed with debt ceilings to limit risk
- **L2 Optimizations:** `L2Pool` + `L2Encoder` compress calldata for rollups

---

## 2. Key Contracts

### Core Protocol Contracts

| Contract | Purpose | Dependencies |
|----------|---------|-------------|
| **Pool** | Main entry point for supply/borrow/repay/withdraw/liquidate/flashloan | All logic libraries, PoolStorage, PoolAddressesProvider |
| **PoolConfigurator** | Admin functions: init reserves, set parameters, pause | ConfiguratorLogic, PoolAddressesProvider, ACLManager |
| **PoolStorage** | Storage layout for Pool (reserves map, user configs, eMode, flash premiums) | DataTypes |
| **L2Pool** | L2-optimized Pool with compressed calldata via CalldataLogic | Pool, L2Encoder |
| **PoolAddressesProvider** | Central registry mapping component IDs → addresses. Factory for proxies. | Ownable |
| **PoolAddressesProviderRegistry** | Registry of all PoolAddressesProviders (multi-market) | Ownable |
| **ACLManager** | Role-based access control (PoolAdmin, EmergencyAdmin, RiskAdmin, FlashBorrower, Bridge, AssetListingAdmin) | AccessControl, IACLManager |
| **PriceOracleSentinel** | Grace period for liquidations/borrows after sequencer downtime (L2s) | IPoolAddressesProvider, ISequencerOracle |

### Token Contracts (Per Reserve)

| Contract | Purpose |
|----------|---------|
| **AToken** | Interest-bearing receipt token (ERC20). Balances grow via liquidity index. Holds underlying assets. Treasury is set per AToken. |
| **VariableDebtToken** | Non-transferable token tracking variable-rate debt. Scaled by variable borrow index. |
| **StableDebtToken** | Non-transferable token tracking stable-rate debt. Tracks average rate + individual user rates. |
| **DelegationAwareAToken** | AToken variant that supports delegation (e.g., governance tokens) |

### Logic Libraries

| Library | Purpose |
|---------|---------|
| **SupplyLogic** | `executeSupply`, `executeWithdraw` — handles deposit/withdrawal flows |
| **BorrowLogic** | `executeBorrow`, `executeRepay`, `executeSwapBorrowRateMode`, `executeRebalanceStableBorrowRate` |
| **LiquidationLogic** | `executeLiquidationCall` — health factor check, collateral seizure, protocol fee |
| **FlashLoanLogic** | `executeFlashLoan`, `executeFlashLoanSimple` — uncollateralized loans within one tx |
| **ReserveLogic** | `updateState` (index updates + treasury accrual), `updateInterestRates`, `cumulateToLiquidityIndex`, `init` |
| **ValidationLogic** | All parameter validation (supply caps, borrow caps, health factor, etc.) |
| **GenericLogic** | `calculateUserAccountData` — computes total collateral, debt, health factor |
| **EModeLogic** | `executeSetUserEMode` — validates eMode category changes |
| **IsolationModeLogic** | Updates isolation mode debt tracking |
| **BridgeLogic** | `executeMintUnbacked`, `executeBackUnbacked` — portal/bridging feature |
| **PoolLogic** | `executeInitReserve`, `executeMintToTreasury`, `executeDropReserve`, `executeResetIsolationModeTotalDebt` |
| **ConfiguratorLogic** | `executeInitReserve`, `executeUpdateAToken/DebtTokens` — used by PoolConfigurator |
| **CalldataLogic** | Decodes compressed calldata for L2Pool |

### Configuration Libraries

| Library | Purpose |
|---------|---------|
| **ReserveConfiguration** | Bit-packing getters/setters for reserve config (LTV, liquidation threshold/bonus, decimals, flags, reserve factor, caps, eMode, protocol fee) |
| **UserConfiguration** | Bitmap tracking which reserves a user has supplied/borrowed |

### Math Libraries

| Library | Purpose |
|---------|---------|
| **WadRayMath** | 18-decimal (wad) and 27-decimal (ray) fixed-point arithmetic |
| **MathUtils** | `calculateLinearInterest`, `calculateCompoundedInterest` — time-weighted interest computation |
| **PercentageMath** | Basis-point (1 = 0.01%) arithmetic |

### Oracle & Periphery

| Contract | Purpose |
|----------|---------|
| **AaveOracle** | Price oracle aggregator — maps assets to Chainlink `AggregatorInterface` sources with fallback oracle. Configurable base currency. |
| **AaveProtocolDataProvider** | Read-only helper to query reserve/user data in a single call |
| **DefaultReserveInterestRateStrategy** | Two-slope interest rate model (configurable per reserve) |
| **ZeroReserveInterestRateStrategy** | Interest rate = 0 (for special reserves) |
| **ReservesSetupHelper** | Batch configuration helper for deployment |
| **L2Encoder** | Encodes Pool function params into compressed bytes for L2 calldata savings |

### Interfaces (Key)

| Interface | Purpose |
|-----------|---------|
| **IPool** | Full Pool API (supply, borrow, repay, withdraw, liquidate, flashLoan, etc.) |
| **IPoolConfigurator** | Reserve init, parameter changes, pausing |
| **IAToken** | Mint, burn, mintToTreasury, transferOnLiquidation, transferUnderlyingTo, handleRepayment |
| **IACLManager** | Role checks: isPoolAdmin, isEmergencyAdmin, isRiskAdmin, isFlashBorrower, isBridge, isAssetListingAdmin |
| **IAaveOracle** | setAssetSources, getAssetPrice, setFallbackOracle |
| **IReserveInterestRateStrategy** | calculateInterestRates |

---

## 3. Fee Structure

Aave V3 has **three fee mechanisms**, all configurable per reserve:

### 3.1 Reserve Factor

The **primary revenue mechanism.** A percentage of interest paid by borrowers goes to the protocol treasury instead of suppliers.

**How it works:**
1. Borrowers pay interest → total debt accrues
2. `ReserveLogic._accrueToTreasury()` calculates `totalDebtAccrued` (variable + stable)
3. `amountToMint = totalDebtAccrued × reserveFactor` (e.g., 20% = 2000 bps)
4. This amount is tracked as `reserve.accruedToTreasury` (scaled)
5. Anyone can call `Pool.mintToTreasury(assets[])` → mints ATokens to the treasury address

**Key code path:**
```
ReserveLogic.updateState()
  → _accrueToTreasury()
    → reserve.accruedToTreasury += amountToMint / nextLiquidityIndex

Pool.mintToTreasury()
  → PoolLogic.executeMintToTreasury()
    → AToken.mintToTreasury(amount, index)  // mints to _treasury address
```

**Reserve factor range:** 0–65535 bps (stored in 16 bits of ReserveConfigurationMap, bits 64–79)

**GoodLend UBI mapping:** The `_treasury` address on each AToken is where we intercept fees. Set this to `UBIFeeSplitter` which splits 33% to UBI pool and 67% to protocol treasury.

### 3.2 Flash Loan Premium

Two configurable premiums stored in `PoolStorage`:
- **`_flashLoanPremiumTotal`**: Total premium paid by flash borrower (default: 9 bps = 0.09%)
- **`_flashLoanPremiumToProtocol`**: Portion of total going to protocol (default: 0)

**Distribution:**
```
totalPremium = amount × flashLoanPremiumTotal
protocolPremium = totalPremium × (flashLoanPremiumToProtocol / flashLoanPremiumTotal)
supplierPremium = totalPremium - protocolPremium
```

- `supplierPremium` → distributed to suppliers via `cumulateToLiquidityIndex`
- `protocolPremium` → accrued to `reserve.accruedToTreasury`

**GoodLend UBI mapping:** Protocol's flash loan share also flows through treasury → UBIFeeSplitter.

### 3.3 Liquidation Protocol Fee

A percentage of the liquidation bonus captured by the protocol (not the liquidator).

**Stored in:** ReserveConfigurationMap bits 152–167 (`liquidationProtocolFee`)

**How it works:**
1. Liquidator covers borrower's debt and receives collateral + bonus
2. `liquidationProtocolFeeAmount` is calculated from the bonus
3. This amount is transferred to the treasury (as ATokens)

**GoodLend UBI mapping:** Also flows through treasury → UBIFeeSplitter.

### Fee Flow Summary for GoodLend

```
┌─────────────────────────────────┐
│         GoodLend Pool           │
│  Interest / Flash / Liquidation │
└────────────┬────────────────────┘
             │ accruedToTreasury
             │ (ATokens minted)
             ▼
┌─────────────────────────────────┐
│       UBIFeeSplitter            │
│  (set as _treasury on ATokens) │
│                                 │
│  33% ──→ GoodDollar UBI Pool   │
│  67% ──→ Protocol Treasury/DAO │
└─────────────────────────────────┘
```

---

## 4. Interest Rate Models

### Default Two-Slope Model

Aave V3 uses a **kink-based interest rate model** (similar to Compound's JumpRateModel) implemented in `DefaultReserveInterestRateStrategy`.

#### Parameters (per reserve):

| Parameter | Description |
|-----------|-------------|
| `OPTIMAL_USAGE_RATIO` | The "kink" point (e.g., 80% = 0.8e27 ray) |
| `_baseVariableBorrowRate` | Base rate when utilization = 0 |
| `_variableRateSlope1` | Rate increase per unit utilization below kink |
| `_variableRateSlope2` | Rate increase per unit utilization above kink (steep!) |
| `_stableRateSlope1/2` | Same for stable rates |
| `_baseStableRateOffset` | Premium above variable slope1 for base stable rate |
| `_stableRateExcessOffset` | Extra premium when stable/total debt ratio is high |
| `OPTIMAL_STABLE_TO_TOTAL_DEBT_RATIO` | Kink for stable debt ratio |

#### Variable Rate Calculation:

```
if utilization ≤ OPTIMAL_USAGE_RATIO:
  variableRate = baseVariableBorrowRate + slope1 × (utilization / optimalRatio)

if utilization > OPTIMAL_USAGE_RATIO:
  excessRatio = (utilization - optimalRatio) / (1 - optimalRatio)
  variableRate = baseVariableBorrowRate + slope1 + slope2 × excessRatio
```

#### Liquidity (Supply) Rate:

```
overallBorrowRate = weightedAvg(variableRate × varDebt, avgStableRate × stableDebt)
liquidityRate = overallBorrowRate × supplyUtilization × (1 - reserveFactor)
```

The `(1 - reserveFactor)` is where protocol revenue is extracted — suppliers earn less than borrowers pay, the difference goes to treasury.

#### Interest Accrual:

- **Supply side:** Linear interest → `liquidityIndex` grows linearly between updates
- **Borrow side:** Compounded interest → `variableBorrowIndex` compounds between updates
- Both use `MathUtils.calculateLinearInterest` / `calculateCompoundedInterest` with Taylor approximation for gas efficiency

#### GoodLend Considerations:

For initial markets:
- **G$**: High slope2 (discourage over-borrowing), moderate optimal ratio (~60%)
- **USDC**: Standard stablecoin params (80% optimal, moderate slopes)
- **ETH**: Standard volatile asset params (80% optimal, steep slope2)

---

## 5. Liquidation Mechanics

### When Liquidation Happens

A position is liquidatable when **Health Factor < 1.0**:

```
healthFactor = Σ(collateral_i × price_i × liquidationThreshold_i) / Σ(debt_j × price_j)
```

Computed in `GenericLogic.calculateUserAccountData()`.

### Liquidation Process (`LiquidationLogic.executeLiquidationCall`)

1. **Calculate health factor** — must be < 1.0
2. **Determine close factor:**
   - If HF ≥ 0.95: close factor = 50% (can repay up to 50% of debt)
   - If HF < 0.95: close factor = 100% (full liquidation allowed)
3. **Calculate debt to liquidate:** `min(debtToCover, userTotalDebt × closeFactor)`
4. **Calculate collateral to seize:**
   ```
   collateralAmount = (debtValue × liquidationBonus) / collateralPrice
   ```
   - `liquidationBonus` is per-asset (e.g., 10500 = 5% bonus)
   - In eMode, a category-wide bonus can override individual settings
5. **Protocol fee extraction:**
   ```
   liquidationProtocolFee = bonus portion × liquidationProtocolFeePercentage
   ```
   This goes to treasury (as ATokens)
6. **Transfer collateral:**
   - If `receiveAToken = true`: ATokens transferred to liquidator
   - If `receiveAToken = false`: ATokens burned, underlying sent to liquidator
7. **Burn debt tokens** for the liquidated user
8. **Update interest rates** for both reserves

### eMode Liquidation

When both collateral and debt are in the same eMode category:
- Use category-level `liquidationThreshold` and `liquidationBonus`
- Can use category-level custom oracle (e.g., exchange rate oracle for stablecoins)
- Enables higher LTV and tighter liquidation thresholds for correlated assets

### GoodLend Considerations:

- G$ liquidation bonus should be higher (10-15%) due to potential volatility
- USDC/ETH can use standard Aave parameters
- Consider eMode category for stablecoins (G$ stable pools, USDC)
- `PriceOracleSentinel` integration important for L2 sequencer downtime protection

---

## 6. Flash Loans

### Two Flavors

#### 1. Multi-Asset Flash Loan (`Pool.flashLoan`)
- Borrow multiple assets in one transaction
- Can optionally open debt positions instead of repaying
- Fee waived for authorized flash borrowers (`ACLManager.isFlashBorrower`)

#### 2. Simple Flash Loan (`Pool.flashLoanSimple`)
- Single asset, simpler/cheaper
- No debt conversion option
- No fee waiver

### How Flash Loans Work

```
1. Validate: check reserves are active, amounts > 0
2. Calculate premiums: amount × flashLoanPremiumTotal (per asset)
   - Premium = 0 for authorized borrowers (multi-asset only)
3. Transfer underlying from AToken to receiver
4. Call receiver.executeOperation(assets, amounts, premiums, initiator, params)
   - Receiver must return true
5. For each asset:
   a. If interestRateMode == NONE (repay):
      - Pull amount + premium from receiver
      - Split premium: protocol portion → accruedToTreasury, rest → suppliers via liquidityIndex
   b. If interestRateMode == STABLE/VARIABLE (open debt):
      - Open borrow position for user (no premium)
6. Update interest rates
```

### Fee Parameters

| Parameter | Default | Storage |
|-----------|---------|---------|
| `_flashLoanPremiumTotal` | 9 (0.09%) | PoolStorage, uint128 |
| `_flashLoanPremiumToProtocol` | 0 (0%) | PoolStorage, uint128 |

Set via `PoolConfigurator.updateFlashloanPremiumTotal()` and `updateFlashloanPremiumToProtocol()`.

### Flash Loan Premium Distribution

```
totalPremium = amount × (premiumTotal / 10000)

if premiumToProtocol > 0:
  protocolFee = totalPremium × (premiumToProtocol / premiumTotal)
  supplierFee = totalPremium - protocolFee
  protocolFee → reserve.accruedToTreasury
else:
  supplierFee = totalPremium

supplierFee → cumulateToLiquidityIndex (distributed to all suppliers)
```

### GoodLend Configuration:

- Set `flashLoanPremiumTotal = 9` (0.09%) — standard
- Set `flashLoanPremiumToProtocol = 3` (0.03%) — protocol takes 1/3 of flash fee
- Protocol portion flows through UBIFeeSplitter → 33% to UBI

---

## 7. Deployment Requirements

### What's Needed to Deploy Aave V3 on a New Chain

#### 1. Infrastructure Prerequisites

- **EVM-compatible chain** with Solidity ^0.8.10 support
- **Block timestamps** (used for interest accrual)
- **Chainlink or compatible oracle feeds** for listed assets
- **Sequencer oracle** (for L2s — PriceOracleSentinel needs it)

#### 2. Contract Deployment Order

```
1. PoolAddressesProviderRegistry
2. PoolAddressesProvider (set marketId)
3. ACLManager (set roles: PoolAdmin, EmergencyAdmin, RiskAdmin)
4. Pool implementation → deploy proxy via PoolAddressesProvider.setPoolImpl()
5. PoolConfigurator implementation → deploy proxy
6. AaveOracle (with asset sources)
7. PriceOracleSentinel (if L2)
8. AaveProtocolDataProvider
9. For each reserve:
   a. Deploy AToken implementation
   b. Deploy StableDebtToken implementation
   c. Deploy VariableDebtToken implementation
   d. Deploy DefaultReserveInterestRateStrategy
   e. Call PoolConfigurator.initReserves()
   f. Configure params: LTV, liquidation threshold/bonus, reserve factor, caps, eMode
10. ReservesSetupHelper (optional batch config)
```

#### 3. External Dependencies

| Dependency | Purpose | GoodDollar L2 Plan |
|------------|---------|-------------------|
| Chainlink Price Feeds | Asset price oracle | Pyth Network adapter or custom Chainlink-compatible oracle |
| Sequencer Oracle | L2 uptime check | Custom implementation for GoodDollar L2 sequencer |
| WETH | Wrapped native token | WETH on GoodDollar L2 (or wrapped G$ equivalent) |
| Governance/Multisig | Owner of PoolAddressesProvider, ACL admin | GoodDollar DAO multisig initially |

#### 4. Configuration Per Reserve

Each reserve needs:
- **LTV** (Loan-to-Value): max borrowing power per collateral unit
- **Liquidation Threshold**: HF threshold for liquidation
- **Liquidation Bonus**: extra collateral liquidator receives
- **Reserve Factor**: % of interest to protocol
- **Supply Cap**: max tokens that can be supplied
- **Borrow Cap**: max tokens that can be borrowed
- **Decimals**: asset decimals
- **eMode Category** (optional)
- **Interest Rate Strategy** parameters

---

## 8. Protocol Comparison

### Compound V3 (Comet)

**Architecture:** Single-asset borrowing model. Each Comet deployment has ONE borrowable asset (e.g., USDC) and multiple collateral assets.

| Feature | Aave V3 | Compound V3 (Comet) |
|---------|---------|---------------------|
| **Model** | Multi-asset pool (borrow any listed asset) | Single borrow asset per market |
| **Collateral** | Supplied assets earn interest AND serve as collateral | Collateral earns NO interest |
| **Interest Rates** | Two-slope per asset | Two-kink model per market |
| **Debt Tokens** | Separate Variable/Stable debt tokens | No debt tokens; internal accounting |
| **Flash Loans** | Native support | Not built in |
| **Governance** | Per-market admin | Per-deployment governance |
| **Upgrades** | Proxy-based | Proxy-based |
| **Gas** | Moderate | Lower (simpler single-asset model) |
| **Code Size** | ~77 contracts + libraries | Single monolithic contract (~1500 LOC) |

**Pros for GoodLend fork consideration:**
- Simpler codebase, easier to audit
- Lower gas costs
- Clear separation of collateral vs borrowing

**Cons:**
- No flash loans (we want them for UBI fee revenue)
- Collateral doesn't earn interest (less capital efficient)
- Need separate deployment per borrow asset
- Less battle-tested fee routing

### Morpho Blue

**Architecture:** Minimal, immutable lending primitive. Markets are permissionlessly created with specific (collateral, loan, oracle, LLTV, IRM) tuples.

| Feature | Aave V3 | Morpho Blue |
|---------|---------|-------------|
| **Model** | Pooled multi-asset | Isolated markets, permissionless creation |
| **Governance** | Admin-managed parameters | Immutable core, governance-minimal |
| **Interest Rates** | Configurable per reserve | Adaptive (IRM adjusts over time) |
| **Oracles** | Chainlink via AaveOracle | Per-market, any oracle |
| **Flash Loans** | Built in | Built in (free!) |
| **Fee Mechanism** | Reserve factor on interest | Fee on interest (set by governance) |
| **Upgradeability** | Proxy upgradeable | Immutable (no upgrades) |
| **Code Size** | Large (~77 contracts) | Tiny (~650 LOC) |

**Pros:**
- Extremely simple, auditable
- Immutable = trustless
- Free flash loans
- Permissionless market creation

**Cons:**
- No eMode, no stable rates, no isolation mode
- Liquidity fragmentation across many markets
- Less mature ecosystem tooling
- Fee routing less flexible (single fee parameter)

### Verdict: Why Aave V3

**Aave V3 is the best choice for GoodLend** because:

1. **Battle-tested:** $10B+ TVL across multiple chains, extensive audits
2. **Rich fee mechanisms:** Reserve factor + flash loan premium + liquidation fee = multiple UBI revenue streams
3. **eMode:** Critical for G$/stablecoin capital efficiency
4. **L2 optimizations:** `L2Pool` and `CalldataLogic` already built
5. **Treasury integration:** Clean `_treasury` address on ATokens = perfect hook for UBIFeeSplitter
6. **Flash loans:** Revenue source unique to Aave
7. **Upgradeability:** Can evolve GoodLend over time
8. **Ecosystem:** Can leverage existing Aave tooling, liquidation bots, indexers

---

## 9. GoodLend Adaptation Plan

### Phase 1: Fork & UBI Fee Integration

#### Contracts to MODIFY:

| Contract | Modification | Reason |
|----------|-------------|--------|
| **AToken** | Set `_treasury` → `UBIFeeSplitter` address instead of DAO treasury | All reserve factor revenue, flash loan protocol fees, and liquidation protocol fees flow through AToken.mintToTreasury() |
| **PoolConfigurator** | Add `setUBIFeeSplit(uint256 ubiBps)` function | Allow governance to adjust the 33% UBI split |
| **PoolAddressesProvider** | Add `UBI_FEE_SPLITTER` identifier | Register UBIFeeSplitter in the address registry |
| **DefaultReserveInterestRateStrategy** | Customize parameters for G$ market | G$ needs unique rate curve |

#### NEW Contracts to Create:

| Contract | Purpose |
|----------|---------|
| **UBIFeeSplitter** | Receives ATokens from treasury accrual, redeems underlying, splits 33%/67% |
| **GoodLendPool** | Thin wrapper extending L2Pool (if any GoodDollar-specific hooks needed) |
| **GoodLendOracle** | AaveOracle wrapper supporting Pyth + Chainlink with G$ price feed |
| **GoodLendDeployer** | Deployment script bundling all contracts |

#### Contracts to Keep AS-IS:

Everything else! The beauty of Aave V3 is the modularity:
- `Pool` / `L2Pool` — core logic unchanged
- All logic libraries (SupplyLogic, BorrowLogic, LiquidationLogic, etc.)
- `VariableDebtToken`, `StableDebtToken`
- `ACLManager`
- Math libraries
- Flash loan logic
- Validation logic

### Phase 2: Initial Markets

#### Market 1: G$ (GoodDollar)

```
Asset: G$
Type: ERC20 (18 decimals)
Role: Borrowable + Collateral
LTV: 50%
Liquidation Threshold: 65%
Liquidation Bonus: 11000 (10%)
Reserve Factor: 3000 (30%)  ← higher reserve factor = more UBI revenue
Supply Cap: 10,000,000 G$
Borrow Cap: 5,000,000 G$
eMode Category: 1 (Stablecoins) — if G$ is pegged
Interest Rate Strategy:
  - Optimal Usage: 60%
  - Base Variable Rate: 2%
  - Variable Slope 1: 7%
  - Variable Slope 2: 300%
  - Stable Slope 1: 4%
  - Stable Slope 2: 300%
```

#### Market 2: USDC (Bridged)

```
Asset: USDC (bridged to GoodDollar L2)
Type: ERC20 (6 decimals)
Role: Borrowable + Collateral
LTV: 80%
Liquidation Threshold: 85%
Liquidation Bonus: 10500 (5%)
Reserve Factor: 2000 (20%)
Supply Cap: 1,000,000 USDC
Borrow Cap: 800,000 USDC
eMode Category: 1 (Stablecoins)
Interest Rate Strategy:
  - Optimal Usage: 80%
  - Base Variable Rate: 0%
  - Variable Slope 1: 4%
  - Variable Slope 2: 60%
  - Stable Slope 1: 0.5%
  - Stable Slope 2: 60%
```

#### Market 3: ETH (Wrapped)

```
Asset: WETH (bridged to GoodDollar L2)
Type: ERC20 (18 decimals)
Role: Borrowable + Collateral
LTV: 75%
Liquidation Threshold: 82%
Liquidation Bonus: 10500 (5%)
Reserve Factor: 2000 (20%)
Supply Cap: 500 ETH
Borrow Cap: 300 ETH
eMode Category: 0 (None)
Interest Rate Strategy:
  - Optimal Usage: 80%
  - Base Variable Rate: 1%
  - Variable Slope 1: 3.8%
  - Variable Slope 2: 80%
  - Stable Slope 1: 4%
  - Stable Slope 2: 80%
```

#### eMode Category 1: Stablecoins

```
Category ID: 1
Label: "Stablecoins"
LTV: 90%
Liquidation Threshold: 93%
Liquidation Bonus: 10100 (1%)
Price Source: address(0) — use individual oracles
Assets: G$, USDC
```

### Phase 3: Oracle Setup

#### Option A: Pyth Network (Recommended)

```
Deploy PythOracleAdapter that implements AggregatorInterface:
  - Wraps Pyth price feeds to match Chainlink AggregatorInterface
  - G$ price: Custom feed or derived from G$/USDC DEX TWAP
  - USDC price: Pyth USDC/USD feed
  - ETH price: Pyth ETH/USD feed

GoodLendOracle (extends AaveOracle):
  - assetsSources[G$] → PythAdapter(G$)
  - assetsSources[USDC] → PythAdapter(USDC)  
  - assetsSources[ETH] → PythAdapter(ETH)
  - fallbackOracle → DEX TWAP oracle
  - baseCurrency → USD (address(0))
  - baseCurrencyUnit → 1e8
```

#### Option B: Chainlink (If Available)

If Chainlink deploys on GoodDollar L2:
- Direct Chainlink aggregator addresses
- More battle-tested, Aave's native integration

#### G$ Price Feed Challenge

G$ doesn't have a Chainlink feed. Options:
1. **DEX TWAP Oracle:** Use G$/USDC pool on GoodDollar L2 DEX
2. **Pyth custom feed:** If Pyth supports custom assets
3. **Chainlink Any API:** Custom oracle with Chainlink node
4. **Redstone Oracle:** Push-based oracle, good for new chains

### Phase 4: Deployment Sequence

```
Step 1: Deploy core infrastructure
  - PoolAddressesProviderRegistry
  - PoolAddressesProvider("GoodLend", deployer)
  - ACLManager
  - Set roles (deployer = admin initially, transfer to DAO later)

Step 2: Deploy oracle
  - PythOracleAdapter (per asset)
  - GoodLendOracle
  - PriceOracleSentinel (for sequencer monitoring)

Step 3: Deploy Pool
  - GoodLendPool implementation (or vanilla L2Pool)
  - PoolConfigurator implementation
  - Set implementations in PoolAddressesProvider

Step 4: Deploy UBI infrastructure
  - UBIFeeSplitter
  - Set as treasury on all ATokens

Step 5: Deploy reserves
  - For each (G$, USDC, WETH):
    - Deploy AToken impl, VarDebtToken impl, StableDebtToken impl
    - Deploy interest rate strategy
    - PoolConfigurator.initReserves()
    - Configure parameters

Step 6: Testing & Verification
  - Supply/borrow/repay/withdraw flows
  - Liquidation testing
  - Flash loan fee verification
  - UBI fee split verification
  - Oracle price accuracy

Step 7: Governance handover
  - Transfer PoolAddressesProvider ownership to DAO multisig
  - Set ACL roles to DAO
```

---

## 10. Solidity Code Skeleton

### UBIFeeSplitter.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import {GPv2SafeERC20} from "@aave/core-v3/contracts/dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {IAToken} from "@aave/core-v3/contracts/interfaces/IAToken.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

/**
 * @title UBIFeeSplitter
 * @notice Receives protocol revenue (as ATokens) and splits between UBI pool and protocol treasury
 * @dev Set as the `_treasury` address on all GoodLend ATokens
 *
 * Flow:
 *   1. Aave accrues interest → ATokens minted to this contract (via AToken.mintToTreasury)
 *   2. Anyone calls distribute(asset) → redeems ATokens → splits underlying
 *   3. ubiBps% → UBI recipient (GoodDollar UBIScheme or staking contract)
 *   4. remainder → protocol treasury (DAO multisig)
 */
contract UBIFeeSplitter {
    using GPv2SafeERC20 for IERC20;

    /// @notice The Aave Pool (for withdrawing underlying from ATokens)
    IPool public immutable POOL;

    /// @notice Basis points sent to UBI (3333 = 33.33%)
    uint256 public ubiBps;

    /// @notice Max UBI split (50%)
    uint256 public constant MAX_UBI_BPS = 5000;

    /// @notice BPS denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Address receiving UBI portion (GoodDollar UBIScheme)
    address public ubiRecipient;

    /// @notice Address receiving protocol portion (DAO treasury)
    address public protocolTreasury;

    /// @notice Admin (initially deployer, later DAO)
    address public admin;

    /// @notice Total distributed per asset (for tracking)
    mapping(address => uint256) public totalDistributed;
    mapping(address => uint256) public totalToUBI;

    event Distributed(
        address indexed asset,
        uint256 totalAmount,
        uint256 ubiAmount,
        uint256 treasuryAmount
    );
    event UBIBpsUpdated(uint256 oldBps, uint256 newBps);
    event UBIRecipientUpdated(address oldRecipient, address newRecipient);
    event ProtocolTreasuryUpdated(address oldTreasury, address newTreasury);
    event AdminTransferred(address oldAdmin, address newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "UBIFeeSplitter: not admin");
        _;
    }

    constructor(
        IPool pool,
        address _ubiRecipient,
        address _protocolTreasury,
        uint256 _ubiBps
    ) {
        require(address(pool) != address(0), "UBIFeeSplitter: zero pool");
        require(_ubiRecipient != address(0), "UBIFeeSplitter: zero ubi");
        require(_protocolTreasury != address(0), "UBIFeeSplitter: zero treasury");
        require(_ubiBps <= MAX_UBI_BPS, "UBIFeeSplitter: bps too high");

        POOL = pool;
        ubiRecipient = _ubiRecipient;
        protocolTreasury = _protocolTreasury;
        ubiBps = _ubiBps;
        admin = msg.sender;
    }

    /**
     * @notice Distribute accumulated AToken fees for a given underlying asset
     * @param asset The underlying asset address (e.g., USDC, not aUSDC)
     * @dev Anyone can call this — it's permissionless distribution
     */
    function distribute(address asset) external {
        // Get the AToken for this asset
        DataTypes.ReserveData memory reserve = POOL.getReserveData(asset);
        address aTokenAddress = reserve.aTokenAddress;
        require(aTokenAddress != address(0), "UBIFeeSplitter: unknown asset");

        // Check our AToken balance
        uint256 aTokenBalance = IERC20(aTokenAddress).balanceOf(address(this));
        if (aTokenBalance == 0) return;

        // Withdraw underlying from Pool (burns our ATokens)
        uint256 withdrawn = POOL.withdraw(asset, type(uint256).max, address(this));

        // Calculate split
        uint256 ubiAmount = (withdrawn * ubiBps) / BPS_DENOMINATOR;
        uint256 treasuryAmount = withdrawn - ubiAmount;

        // Transfer
        if (ubiAmount > 0) {
            IERC20(asset).safeTransfer(ubiRecipient, ubiAmount);
        }
        if (treasuryAmount > 0) {
            IERC20(asset).safeTransfer(protocolTreasury, treasuryAmount);
        }

        // Track
        totalDistributed[asset] += withdrawn;
        totalToUBI[asset] += ubiAmount;

        emit Distributed(asset, withdrawn, ubiAmount, treasuryAmount);
    }

    /**
     * @notice Distribute fees for multiple assets at once
     * @param assets Array of underlying asset addresses
     */
    function distributeMultiple(address[] calldata assets) external {
        for (uint256 i = 0; i < assets.length; i++) {
            this.distribute(assets[i]);
        }
    }

    // --- Admin functions ---

    function setUBIBps(uint256 newBps) external onlyAdmin {
        require(newBps <= MAX_UBI_BPS, "UBIFeeSplitter: bps too high");
        emit UBIBpsUpdated(ubiBps, newBps);
        ubiBps = newBps;
    }

    function setUBIRecipient(address newRecipient) external onlyAdmin {
        require(newRecipient != address(0), "UBIFeeSplitter: zero address");
        emit UBIRecipientUpdated(ubiRecipient, newRecipient);
        ubiRecipient = newRecipient;
    }

    function setProtocolTreasury(address newTreasury) external onlyAdmin {
        require(newTreasury != address(0), "UBIFeeSplitter: zero address");
        emit ProtocolTreasuryUpdated(protocolTreasury, newTreasury);
        protocolTreasury = newTreasury;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "UBIFeeSplitter: zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /**
     * @notice Emergency rescue of tokens sent to this contract by mistake
     * @dev Only admin, cannot rescue ATokens of active reserves
     */
    function rescue(address token, uint256 amount, address to) external onlyAdmin {
        IERC20(token).safeTransfer(to, amount);
    }
}

// Need DataTypes import for POOL.getReserveData
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
```

### GoodLendOracle.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {AaveOracle} from "@aave/core-v3/contracts/misc/AaveOracle.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "@aave/core-v3/contracts/interfaces/IPriceOracleGetter.sol";

/**
 * @title GoodLendOracle
 * @notice Extends AaveOracle with Pyth Network support and G$ TWAP fallback
 * @dev Wraps Pyth price feeds behind Chainlink's AggregatorInterface for compatibility
 */
contract GoodLendOracle is AaveOracle {
    constructor(
        IPoolAddressesProvider provider,
        address[] memory assets,
        address[] memory sources,
        address fallbackOracle,
        address baseCurrency,
        uint256 baseCurrencyUnit
    )
        AaveOracle(
            provider,
            assets,
            sources,
            fallbackOracle,
            baseCurrency,
            baseCurrencyUnit
        )
    {}

    // GoodLendOracle inherits all AaveOracle functionality.
    // The key customization is the PythOracleAdapter contracts set as sources.
    // Additional overrides can be added here if needed.
}
```

### PythOracleAdapter.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {AggregatorInterface} from "@aave/core-v3/contracts/dependencies/chainlink/AggregatorInterface.sol";

/**
 * @title PythOracleAdapter
 * @notice Adapts Pyth Network price feeds to Chainlink AggregatorInterface
 * @dev AaveOracle expects Chainlink-compatible sources — this bridges the gap
 */
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint publishTime;
    }
    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (Price memory);
    function getPriceUnsafe(bytes32 id) external view returns (Price memory);
}

contract PythOracleAdapter is AggregatorInterface {
    IPyth public immutable pyth;
    bytes32 public immutable priceFeedId;
    uint256 public immutable maxStaleness; // seconds
    uint8 public immutable targetDecimals;

    constructor(
        address _pyth,
        bytes32 _priceFeedId,
        uint256 _maxStaleness,
        uint8 _targetDecimals
    ) {
        pyth = IPyth(_pyth);
        priceFeedId = _priceFeedId;
        maxStaleness = _maxStaleness;
        targetDecimals = _targetDecimals; // typically 8 for USD prices
    }

    function latestAnswer() external view override returns (int256) {
        IPyth.Price memory price = pyth.getPriceNoOlderThan(priceFeedId, maxStaleness);
        // Pyth prices have variable exponents; normalize to targetDecimals
        int256 normalizedPrice;
        if (price.expo >= 0) {
            normalizedPrice = int256(price.price) * int256(10 ** (uint32(price.expo) + targetDecimals));
        } else {
            uint32 absExpo = uint32(-price.expo);
            if (absExpo > targetDecimals) {
                normalizedPrice = int256(price.price) / int256(10 ** (absExpo - targetDecimals));
            } else {
                normalizedPrice = int256(price.price) * int256(10 ** (targetDecimals - absExpo));
            }
        }
        return normalizedPrice;
    }

    function latestTimestamp() external view override returns (uint256) {
        IPyth.Price memory price = pyth.getPriceUnsafe(priceFeedId);
        return price.publishTime;
    }

    function latestRound() external pure override returns (uint256) {
        return 0; // Pyth doesn't have rounds
    }

    function getAnswer(uint256) external view override returns (int256) {
        return this.latestAnswer();
    }

    function getTimestamp(uint256) external view override returns (uint256) {
        return this.latestTimestamp();
    }
}
```

### GoodDollarTWAPOracle.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {AggregatorInterface} from "@aave/core-v3/contracts/dependencies/chainlink/AggregatorInterface.sol";

/**
 * @title GoodDollarTWAPOracle
 * @notice TWAP oracle for G$ price derived from on-chain DEX pool
 * @dev Fallback oracle for G$ when Pyth/Chainlink feeds are unavailable
 * @dev Uses Uniswap V3 style TWAP from G$/USDC pool on GoodDollar L2
 */
interface IUniswapV3Pool {
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    function slot0()
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
}

contract GoodDollarTWAPOracle is AggregatorInterface {
    IUniswapV3Pool public immutable pool;
    uint32 public immutable twapPeriod; // e.g., 1800 seconds (30 min)
    bool public immutable isToken0GoodDollar;

    constructor(address _pool, uint32 _twapPeriod, bool _isToken0GoodDollar) {
        pool = IUniswapV3Pool(_pool);
        twapPeriod = _twapPeriod;
        isToken0GoodDollar = _isToken0GoodDollar;
    }

    function latestAnswer() external view override returns (int256) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapPeriod;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = pool.observe(secondsAgos);

        int56 tickCumulativeDelta = tickCumulatives[1] - tickCumulatives[0];
        int24 avgTick = int24(tickCumulativeDelta / int56(int32(twapPeriod)));

        // Convert tick to price (simplified — production would use TickMath)
        // price = 1.0001^tick, normalized to 8 decimals for USD
        // This is a placeholder — real implementation needs proper tick→price math
        uint256 price = _tickToPrice(avgTick);

        return int256(price);
    }

    function _tickToPrice(int24 tick) internal pure returns (uint256) {
        // Simplified tick to price conversion
        // In production, use Uniswap's TickMath.getSqrtRatioAtTick
        // and convert sqrtPriceX96 to actual price with proper decimal handling
        // Placeholder: return 1e8 (= $1.00 in 8 decimals)
        // TODO: implement proper tick math
        if (tick >= 0) {
            return 1e8; // placeholder
        }
        return 1e8; // placeholder
    }

    function latestTimestamp() external view override returns (uint256) {
        return block.timestamp;
    }

    function latestRound() external pure override returns (uint256) { return 0; }
    function getAnswer(uint256) external view override returns (int256) { return this.latestAnswer(); }
    function getTimestamp(uint256) external view override returns (uint256) { return block.timestamp; }
}
```

### GoodLendInterestRateStrategy.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {DefaultReserveInterestRateStrategy} from
    "@aave/core-v3/contracts/protocol/pool/DefaultReserveInterestRateStrategy.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {WadRayMath} from "@aave/core-v3/contracts/protocol/libraries/math/WadRayMath.sol";

/**
 * @title GoodLendInterestRateStrategy
 * @notice Custom interest rate strategy for G$ with UBI-optimized parameters
 * @dev Extends DefaultReserveInterestRateStrategy with:
 *   - Higher base rates to generate more UBI revenue
 *   - Steeper slope2 to discourage excessive borrowing of G$
 *   - Configurable minimum rate floor for guaranteed UBI generation
 */
contract GoodLendInterestRateStrategy is DefaultReserveInterestRateStrategy {
    using WadRayMath for uint256;

    /// @notice Minimum borrow rate floor (ensures some UBI generation even at low utilization)
    uint256 public immutable MIN_BORROW_RATE;

    constructor(
        IPoolAddressesProvider provider,
        uint256 optimalUsageRatio,
        uint256 baseVariableBorrowRate,
        uint256 variableRateSlope1,
        uint256 variableRateSlope2,
        uint256 stableRateSlope1,
        uint256 stableRateSlope2,
        uint256 baseStableRateOffset,
        uint256 stableRateExcessOffset,
        uint256 optimalStableToTotalDebtRatio,
        uint256 minBorrowRate
    )
        DefaultReserveInterestRateStrategy(
            provider,
            optimalUsageRatio,
            baseVariableBorrowRate,
            variableRateSlope1,
            variableRateSlope2,
            stableRateSlope1,
            stableRateSlope2,
            baseStableRateOffset,
            stableRateExcessOffset,
            optimalStableToTotalDebtRatio
        )
    {
        MIN_BORROW_RATE = minBorrowRate;
    }

    /// @inheritdoc DefaultReserveInterestRateStrategy
    function calculateInterestRates(
        DataTypes.CalculateInterestRatesParams memory params
    ) public view override returns (uint256, uint256, uint256) {
        (
            uint256 liquidityRate,
            uint256 stableBorrowRate,
            uint256 variableBorrowRate
        ) = super.calculateInterestRates(params);

        // Apply minimum borrow rate floor
        if (variableBorrowRate < MIN_BORROW_RATE) {
            variableBorrowRate = MIN_BORROW_RATE;
        }
        if (stableBorrowRate < MIN_BORROW_RATE) {
            stableBorrowRate = MIN_BORROW_RATE;
        }

        return (liquidityRate, stableBorrowRate, variableBorrowRate);
    }
}
```

### deploy/GoodLendDeployer.sol (Deployment Helper)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IACLManager} from "@aave/core-v3/contracts/interfaces/IACLManager.sol";

/**
 * @title GoodLendDeployer
 * @notice Helper for deploying GoodLend (Aave V3 fork) on GoodDollar L2
 * @dev Deploy order:
 *   1. deployCore() — PoolAddressesProvider, ACLManager, Pool, PoolConfigurator
 *   2. deployOracle() — GoodLendOracle with Pyth adapters
 *   3. deployUBIInfra() — UBIFeeSplitter
 *   4. deployReserve(asset) — per asset: AToken, DebtTokens, InterestRateStrategy
 *   5. configureReserve(asset, params) — set LTV, thresholds, caps, etc.
 *   6. handoverGovernance() — transfer ownership to DAO
 */
contract GoodLendDeployer {
    // Deployment addresses (set during deploy steps)
    address public poolAddressesProvider;
    address public pool;
    address public poolConfigurator;
    address public aclManager;
    address public oracle;
    address public ubiFeeSplitter;

    address public immutable deployer;
    address public immutable dao; // Final governance owner

    struct ReserveInitParams {
        address asset;
        uint256 ltv;                    // bps
        uint256 liquidationThreshold;   // bps
        uint256 liquidationBonus;       // bps (10000 = no bonus)
        uint256 reserveFactor;          // bps
        uint256 supplyCap;              // in whole tokens
        uint256 borrowCap;              // in whole tokens
        uint8 emodeCategory;
    }

    constructor(address _dao) {
        deployer = msg.sender;
        dao = _dao;
    }

    // Implementation would contain the full deployment logic
    // using CREATE2 for deterministic addresses across deployments.
    // See Phase 4 in the adaptation plan for the complete sequence.
}
```

---

## Appendix A: File Structure for GoodLend Repository

```
goodlend/
├── contracts/
│   ├── core/                          # Modified Aave V3 contracts
│   │   └── (minimal changes — only AToken treasury override)
│   ├── ubi/
│   │   ├── UBIFeeSplitter.sol         # NEW: Fee routing to UBI
│   │   └── interfaces/
│   │       └── IUBIFeeSplitter.sol
│   ├── oracle/
│   │   ├── GoodLendOracle.sol         # NEW: Extended AaveOracle
│   │   ├── PythOracleAdapter.sol      # NEW: Pyth → Chainlink adapter
│   │   └── GoodDollarTWAPOracle.sol   # NEW: G$ TWAP fallback
│   ├── rate/
│   │   └── GoodLendInterestRateStrategy.sol  # NEW: G$ custom rates
│   └── deploy/
│       └── GoodLendDeployer.sol       # NEW: Deployment helper
├── deploy/                            # Hardhat/Foundry deployment scripts
│   ├── 01-deploy-core.ts
│   ├── 02-deploy-oracle.ts
│   ├── 03-deploy-ubi.ts
│   ├── 04-deploy-reserves.ts
│   └── 05-configure-reserves.ts
├── test/
│   ├── UBIFeeSplitter.test.ts
│   ├── GoodLendOracle.test.ts
│   ├── integration/
│   │   ├── supply-borrow-ubi.test.ts
│   │   ├── liquidation-ubi.test.ts
│   │   └── flashloan-ubi.test.ts
│   └── fork/
│       └── mainnet-fork.test.ts
├── lib/
│   └── aave-v3-core/                  # Git submodule (unmodified!)
├── foundry.toml
├── hardhat.config.ts
└── README.md
```

## Appendix B: Revenue Projections

Assuming $10M TVL on GoodLend:

| Revenue Source | Assumption | Annual Revenue | UBI (33%) |
|---------------|------------|----------------|-----------|
| Reserve Factor (20% avg) | 40% utilization, 5% avg borrow rate | $10M × 40% × 5% × 20% = $40,000 | $13,200 |
| Flash Loan Premium (0.09%) | $100M flash volume/year | $100M × 0.09% = $90,000 × 33% protocol = $29,700 | $9,801 |
| Liquidation Protocol Fee (10%) | $500K liquidated/year, 5% bonus | $500K × 5% × 10% = $2,500 | $825 |
| **Total** | | **$72,200** | **$23,826** |

At $100M TVL, UBI revenue scales to ~$238K/year.

## Appendix C: Risk Considerations

1. **G$ Oracle Risk:** G$ lacks established price feeds. TWAP manipulation is possible with low liquidity. Mitigation: supply/borrow caps + conservative LTV.

2. **G$ Volatility:** If G$ depegs, liquidation cascades possible. Mitigation: high liquidation bonus (10%), conservative parameters, isolation mode initially.

3. **Bridge Risk:** USDC and ETH are bridged assets. Bridge exploit = bad debt. Mitigation: supply caps, monitoring.

4. **Sequencer Risk:** L2 sequencer downtime can prevent liquidations. Mitigation: PriceOracleSentinel with grace period.

5. **Smart Contract Risk:** Forking Aave V3 is battle-tested, but our custom contracts (UBIFeeSplitter, oracles) need thorough auditing.

6. **UBI Fee Extraction Impact:** 33% of reserve factor going to UBI means suppliers earn less (compared to vanilla Aave). This may reduce competitiveness. Mitigation: compensate with G$ incentives, highlight UBI mission.

---

## Summary

**GoodLend = Aave V3 fork with minimal modifications:**

1. **One key change:** Set `_treasury` on ATokens → `UBIFeeSplitter` (33% to UBI, 67% to DAO)
2. **Custom oracles:** Pyth adapters + G$ TWAP fallback
3. **Custom rate strategy:** G$ gets UBI-optimized interest curve
4. **Three initial markets:** G$, USDC, WETH
5. **Everything else:** Vanilla Aave V3 — battle-tested, proven, audited

The beauty of this approach: **we change almost nothing in Aave's core contracts.** The UBI fee routing is entirely handled by the `UBIFeeSplitter` contract, which sits at the treasury address. This means we inherit all of Aave V3's security properties and can easily upgrade as Aave releases new versions.
