This is a complex, multi-layered architectural challenge that requires moving from a proof-of-concept (PoC) structure to a production-grade, industrial-scale DeFi primitive. The primary bottlenecks are **Data Ingestion Scalability (Oracles)**, **State Management (Gas Efficiency)**, and **Risk Synchronization (Liquidation)**.

Here is a comprehensive, technical architecture design.

---

## 🏛️ Overall System Architecture Blueprint

The system must evolve from a monolithic set of interacting contracts to a modular, event-driven architecture.

**Key Architectural Shift:** Decouple the *Price Feed* from the *Asset Minting* and *Trading Logic*. The Price Feed becomes the single source of truth, consumed by multiple downstream consumers (Synthetics, Perps, Risk Engine).

| Component | Role | Technology Focus |
| :--- | :--- | :--- |
| **Data Ingestion Layer** | Aggregates, normalizes, and publishes 600+ real-time price feeds. | Pyth Network / Chainlink CCIP |
| **Synthetic Layer** | Mints $\text{Synthetics}_{i}$ (ERC-20) based on collateralization ratios. | Optimized Factory/Vault Contracts |
| **Perpetual Layer** | Manages $\text{Perp}_{i}$ contracts (Margin, Funding, Position). | Dedicated Perp Vaults |
| **Risk & Settlement Layer** | Centralized engine for margin checks, liquidation, and collateral management. | State Machine Logic / Event Listeners |
| **Market Logic Layer** | Handles time-gating and market open/close procedures. | Time-Locked Contracts / Oracles |

---

## A. Oracle Architecture: Scaling to 600+ Assets

Relying on a manual Chainlink aggregator or a single backend service is insufficient for 600+ high-frequency assets. We need a robust, decentralized, and high-throughput solution.

### 1. Primary Oracle Choice: Pyth Network (Recommended)
For institutional-grade, high-volume, low-latency data feeds, **Pyth Network** is superior to standard Chainlink implementations for this scale.

*   **Mechanism:** Pyth provides direct, high-frequency price feeds derived from multiple off-chain sources (e.g., major exchanges, proprietary data providers).
*   **Efficiency:** It allows for the publication of multiple assets ($\text{Stock}_A, \text{Stock}_B, \dots$) within a single transaction or data stream, drastically reducing gas overhead compared to calling 600 separate Chainlink feeds.
*   **Implementation:** The `PriceOracle` contract becomes a **Pyth Consumer Contract**. It subscribes to the aggregated Pyth feed for the entire NASDAQ/S&P basket.

### 2. Secondary/Fallback Oracle: Chainlink CCIP
If Pyth is unavailable or for regulatory redundancy, Chainlink's **CCIP (Cross-Chain Interoperability Protocol)** is the necessary evolution.

*   **Mechanism:** Use CCIP to connect to established, reliable off-chain data aggregators (e.g., Bloomberg Terminal feeds, major exchange APIs) and publish the standardized price data onto L2/L1.
*   **Data Structure:** The oracle must publish a structured data payload containing: `[Timestamp, Asset_ID, Price, Deviation_Metric]`.

### 3. Data Normalization & Indexing
The `PriceOracle` contract must implement a **Price Indexing Service**. Instead of storing 600 individual prices, it should store a mapping: `mapping(AssetID => PriceData)`. This allows the entire system to reference the latest price for any asset ID via a single, gas-efficient lookup.

---

## B. Gas Optimization Strategies

Scaling to 600 assets means $600 \times (\text{Gas Cost per Operation})$. Optimization is paramount.

1.  **Batch Operations (The Core Strategy):**
    *   **Price Updates:** Instead of having 600 individual calls to update prices, the `PriceOracle` contract must process and publish updates for all 600 assets in **one atomic transaction**.
    *   **Position Updates:** When a user interacts (e.g., depositing collateral, liquidating), the smart contract should accept an array of operations: `updatePositions(user, [assetID_A, assetID_B, ...], [amount_A, amount_B, ...])`.

2.  **Lazy Price Updates (Read Optimization):**
    *   For non-critical reads (e.g., checking collateralization ratio in a dashboard), the contract should implement **view functions** that read the last known price from the `PriceOracle` state variable, rather than forcing a real-time oracle call.
    *   **State Management:** Only the *writing* of the price (the oracle update) must be gas-intensive. Reads should be cheap.

3.  **Event-Driven Architecture:**
    *   Instead of querying the state constantly, all critical changes (Price Change, Deposit, Liquidate) must emit **structured, standardized Events**. Downstream services (e.g., the Risk Engine, UI frontends) subscribe to these events via indexers (The Graph) or direct listener contracts, minimizing direct contract interaction gas costs.

---

## C. Synthetic Stocks as Underlying for Perpetual Contracts

The synthetic stock ($\text{Synthetics}_{i}$) is the **underlying asset** for the perpetual contract ($\text{Perp}_{i}$).

1.  **The Relationship:**
    *   **Synthetic Asset ($\text{Synthetics}_{i}$):** An ERC-20 token representing the *value* of the underlying stock, backed by collateral ($\text{G}\$$). Its price is pegged to the real-world stock price via the Oracle.
    *   **Perpetual Contract ($\text{Perp}_{i}$):** A derivative contract whose value is pegged to the *change* in the $\text{Synthetics}_{i}$ price.

2.  **Mechanism:**
    *   The `PerpEngine` does **not** reference the raw stock price. It references the **price of $\text{Synthetics}_{i}$** as published by the `PriceOracle`.
    *   **Pricing:** The perpetual contract's mark price calculation uses the $\text{Synthetics}_{i}$ price feed:
        $$\text{MarkPrice}_{i} = \text{PriceOracle}(\text{Synthetics}_{i})$$
    *   **Funding Rate Calculation:** The funding rate is determined by the deviation of the $\text{Perp}_{i}$ price from the $\text{Synthetics}_{i}$ price, indicating whether the perpetual market is over-leveraged relative to the synthetic asset's current valuation.

---

## D. Unified Liquidation Engine

The liquidation engine must be centralized and agnostic to whether the position is synthetic or perpetual.

**The Central Component: The Risk Manager Contract**

1.  **Single Source of Truth:** The `RiskManager` contract is the only entity authorized to initiate liquidations. It constantly monitors the collateralization ratio (CR) for *all* user positions.
2.  **Position Abstraction:** All user positions (Synthetic Long/Short, Perpetual Long/Short) are mapped to a unified `Position` struct:
    $$\text{Position} = \{ \text{User}, \text{AssetID}, \text{TotalNotional}, \text{CollateralHeld}, \text{PositionType} \}$$
3.  **Liquidation Trigger:**
    *   **Trigger:** $\text{CR} < \text{Threshold}$ (e.g., 110%).
    *   **Calculation:** The engine calculates the required liquidation amount based on the current $\text{MarkPrice}_{i}$ (from the Oracle) and the position's notional value.
    *   **Execution:** The `RiskManager` calls the specific settlement function on the relevant contract (`PerpEngine.liquidate()` or `SyntheticVault.liquidate()`), passing the calculated amount.
4.  **Cross-Asset Liquidation:** If a user is undercollateralized across multiple assets (e.g., low collateral on $\text{Stock}_A$ and $\text{Stock}_B$), the engine liquidates the position that yields the highest recovery rate for the protocol, prioritizing the most undercollateralized asset first.

---

## E. Specific Protocols and Services Reference

| Functionality | Recommended Protocol/Service | Rationale |
| :--- | :--- | :--- |
| **High-Volume Oracles** | **Pyth Network** | Superior throughput and lower gas costs for 600+ feeds compared to standard L1 oracle calls. |
| **Interoperability** | **Chainlink CCIP** | Necessary for connecting to external, regulated data sources outside the immediate L1 environment. |
| **Synthetic Structure** | **Synthetix V3 Architecture** | Use their modular approach: distinct vaults for collateralization, asset minting, and redemption, ensuring separation of concerns. |
| **Perpetual Futures** | **dYdX V4/Aave v3 (Perps)** | Adopt their robust, battle-tested mechanisms for funding rate calculation, collateral management, and liquidation logic. |
| **Smart Contract Framework** | **Solidity/EVM Standards** | Strict adherence to ERC-20, ERC-1167 (for factory), and implementing OpenZeppelin's secure patterns. |

---

## F. Market Hours Handling (Time-Gating)

This is the most critical operational difference between equities and crypto. The system must operate in distinct "modes."

### 1. Time-Gating Mechanism
A dedicated **Market Governor Contract** controls the operational state of the system.

*   **State Variables:** The Governor maintains state flags: `IS_MARKET_OPEN`, `IS_TRADING_ACTIVE`, `IS_ORACLE_ACTIVE`.
*   **Time Source:** The contract must use a reliable, verifiable time source (e.g., Chainlink Keepers triggering state changes based on UTC time).

### 2. Operational Modes

| Time Period | Market State | Oracle Action | Trading Engine Action |
| :--- | :--- | :--- | :--- |
| **Pre-Market/After-Hours** | **Synthetic Only** | Oracle updates continue (using *last known* price or specialized pre-market feeds). | **Perps:** Funding rates are calculated, but margin trading is restricted or uses a reduced multiplier. |
| **Market Open (9:30 AM ET)** | **Full Operation** | Oracle publishes real-time, high-frequency updates. | **All:** Full margin trading, liquidation engine fully active. |
| **Market Close (4:00 PM ET)** | **Settlement/Pause** | Oracle publishes a final closing price for the day. | **Perps:** Trading is paused. The system enters a *settlement window* where only liquidation and funding rate accrual can occur until the next open. |
| **Off-Hours (Crypto)** | **Perp Only** | Oracle continues to feed the *last known* price, but the synthetic asset minting/redemption might be paused or throttled to prevent arbitrage based on stale data. | **Perps:** Full 24/7 operation. |

**Technical Implementation Detail:**
The `PerpEngine` and `SyntheticVault` must check the `MarketGovernor.isActive()` status before executing any trade logic. If inactive, the transaction reverts or executes a restricted, pre-defined fallback function (e.g., only allowing margin calls, but blocking new entries).

---

## Implementation Plan for GoodDollar L2

### Phase 1: Oracle Upgrade (Week 1-2)

**Current:** Manual price setting via Yahoo Finance keeper for 12 stocks
**Target:** Pyth Network pull oracle for 600+ assets

#### Changes needed:

1. **New contract: `PythPriceAdapter.sol`**
```solidity
interface IPyth {
    function getPriceUnsafe(bytes32 id) external view returns (PythPrice memory);
    function updatePriceFeeds(bytes[] calldata data) external payable;
}

contract PythPriceAdapter {
    IPyth public immutable pyth;
    mapping(bytes32 => bytes32) public tickerToPythId; // "AAPL" => pyth price ID
    
    function getPrice(string calldata ticker) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(ticker));
        PythPrice memory p = pyth.getPriceUnsafe(tickerToPythId[key]);
        require(block.timestamp - p.publishTime < MAX_STALENESS, "stale");
        return uint256(int256(p.price)) * 10**(8 - uint256(int256(p.expo)));
    }
    
    // Batch register tickers (admin only, called once per listing batch)
    function registerTickers(string[] calldata tickers, bytes32[] calldata pythIds) external onlyAdmin;
}
```

2. **Batch listing script: `ListNasdaq100.s.sol`**
```solidity
// Deploy all 100 NASDAQ stocks in a single tx using SyntheticAssetFactory
function run() external {
    string[100] memory tickers = ["AAPL","MSFT","AMZN","NVDA","GOOGL","META","TSLA","AVGO","COST","NFLX",...];
    for (uint i = 0; i < tickers.length; i++) {
        factory.listAsset(tickers[i], string.concat("s", tickers[i]), vault);
    }
}
```
Gas estimate: ~170k per listing (EIP-1167 clone) × 100 = ~17M gas. Split into 2 txs.

3. **Update stocks-keeper** to use Pyth SDK instead of Yahoo Finance:
```typescript
import { PriceServiceConnection } from "@pythnetwork/price-service-client";
const connection = new PriceServiceConnection("https://hermes.pyth.network");
// Fetch all 500 prices in one call
const priceFeeds = await connection.getLatestPriceFeeds(pythPriceIds);
```

### Phase 2: Scale to NASDAQ-100 (Week 2-3)

1. Deploy PythPriceAdapter with all 100 NASDAQ Pyth price IDs
2. Batch-list 100 stocks via SyntheticAssetFactory (2 deploy txs)
3. Update frontend stock listing page to paginate (sectors, search, filters)
4. Add sector classification (Technology, Healthcare, Finance, etc.)
5. Update stocks-keeper to push Pyth updates on-chain (pull model — users pay update fee)

### Phase 3: Connect Stocks ↔ Perps (Week 3-4)

**Key insight:** Synthetic stock tokens (sAAPL, sTSLA) become the BASE ASSET for perpetual futures contracts. Users can:
- Go long AAPL stock via synthetic (spot exposure, needs 150% collateral)
- Go long AAPL perp (leveraged exposure, needs only 2-10% margin)
- Arbitrage between spot synthetic and perp price

#### New contract: `StockPerpEngine.sol`
```solidity
contract StockPerpEngine is PerpEngine {
    SyntheticAssetFactory public factory;
    PythPriceAdapter public oracle;
    
    // Create a perp market for any listed stock
    function createStockPerpMarket(
        string calldata ticker,
        uint256 maxLeverage,   // e.g., 20x for stocks (less than 50x for crypto)
        uint256 maintenanceMarginBPS // e.g., 500 = 5%
    ) external onlyAdmin {
        bytes32 key = keccak256(abi.encodePacked(ticker));
        require(factory.assets(key) != address(0), "stock not listed");
        
        // Create market using same oracle as the synthetic
        _createMarket(key, key, maxLeverage, maintenanceMarginBPS);
    }
    
    // Users can use synthetic stock tokens AS collateral for perp positions
    function depositSyntheticCollateral(
        string calldata ticker,
        uint256 amount
    ) external {
        address synthetic = factory.assets(keccak256(abi.encodePacked(ticker)));
        SyntheticAsset(synthetic).transferFrom(msg.sender, address(marginVault), amount);
        // Credit margin at current oracle price * haircut (e.g., 80%)
        uint256 price = oracle.getPrice(ticker);
        uint256 marginValue = (amount * price * SYNTHETIC_HAIRCUT) / (1e18 * 1e8 * 10000);
        marginVault.creditMargin(msg.sender, marginValue);
    }
}
```

#### Unified position types:
| Position Type | Collateral | Leverage | Use Case |
|--------------|-----------|----------|----------|
| Synthetic spot | G$ (150%) | 1x | Long-term stock exposure |
| Stock perp | G$ margin | Up to 20x | Leveraged stock trading |
| Cross-margined | sAAPL + G$ | Up to 20x | Capital efficient (use stocks as margin) |

### Phase 4: S&P 500 Expansion (Week 4-6)

1. Register remaining 400 S&P tickers in PythPriceAdapter
2. Batch-list in 5 deploy txs (~100 each)
3. Auto-create perp markets for top 100 by volume
4. Add sector indices (sTECH, sHEALTH, sFINANCE) — basket synthetics

### Phase 5: Market Hours Logic (Week 5-6)

```solidity
contract MarketHoursController {
    // US market: 9:30 AM - 4:00 PM ET, Mon-Fri
    // Pre-market: 4:00 AM - 9:30 AM ET
    // After-hours: 4:00 PM - 8:00 PM ET
    
    function isMarketOpen(string calldata ticker) public view returns (bool) {
        if (isUSStock(ticker)) {
            (uint256 hour, uint256 minute, uint256 dayOfWeek) = _getETTime();
            if (dayOfWeek == 0 || dayOfWeek == 6) return false; // Weekend
            uint256 minuteOfDay = hour * 60 + minute;
            return minuteOfDay >= 570 && minuteOfDay <= 960; // 9:30-16:00
        }
        return true; // Crypto: always open
    }
    
    // PERPS trade 24/7 regardless — only oracle updates pause
    // SYNTHETICS: minting/burning follows market hours
    // Trading synthetic tokens on GoodSwap: 24/7 (secondary market)
}
```

**Key design decision:** 
- Synthetic minting/redemption: restricted to market hours (need accurate prices)
- Secondary trading of synthetic tokens on GoodSwap: 24/7 (AMM pricing)
- Perp trading: 24/7 but funding rate adjusts based on oracle freshness
- Oracle updates: Pyth provides after-hours pricing where available

### Gas & Cost Analysis

| Operation | Gas | Cost @ 0.01 gwei |
|-----------|-----|-------------------|
| List 1 stock (EIP-1167 clone) | ~170K | ~$0.001 |
| List 100 stocks (batch) | ~17M | ~$0.10 |
| List 500 stocks (5 batches) | ~85M | ~$0.50 |
| Pyth price update (1 feed) | ~50K | ~$0.0003 |
| Pyth price update (batch 100) | ~2M | ~$0.012 |
| Open stock perp position | ~250K | ~$0.0015 |
| Mint synthetic stock | ~200K | ~$0.0012 |

Total deployment cost for all 500 stocks: **< $1** on GoodDollar L2

### Reference Protocols

| Protocol | What to Learn | Link |
|----------|---------------|------|
| Synthetix V3 | Multi-collateral synthetic system, cross-margin | github.com/Synthetixio/synthetix-v3 |
| Pyth Network | Pull oracle model, 500+ stock feeds | pyth.network/price-feeds |
| GMX V2 | Synthetic perps using oracle pricing | github.com/gmx-io/gmx-synthetics |
| dYdX V4 | Order book perps, stock-like products | github.com/dydxprotocol/v4-chain |
| Kwenta | Synthetix-based stock perps | github.com/Kwenta/kwenta |
| GNS/gTrade | Stock/forex/crypto perps unified | github.com/GainsNetwork-org |

### Summary

| Milestone | Stocks | Perp Markets | Timeline |
|-----------|--------|-------------|----------|
| Current | 12 | 3 (BTC/ETH/SOL) | Done |
| Phase 1-2 | 100 (NASDAQ-100) | 3 | +2 weeks |
| Phase 3 | 100 | 103 (3 crypto + 100 stocks) | +4 weeks |
| Phase 4 | 500 (S&P 500) | 200+ | +6 weeks |
| Phase 5 | 500 + market hours | 200+ with 24/7 perps | +6 weeks |

