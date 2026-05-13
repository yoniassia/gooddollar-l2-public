# GoodStocks — Product Requirements Document

**Version:** 1.0 | **Status:** Contracts shipped (commit 7a3f24c) | **Author:** Protocol Engineer

---

## 1. Overview

GoodStocks is a synthetic equity platform on GoodDollar L2. Users can trade fractional shares of US equities 24/7 without a brokerage account. Every trade contributes to universal basic income.

**Core proposition:** Anyone with a GoodDollar account can own a fraction of Apple, Microsoft, or Tesla — no KYC, no minimums, no market hours.

---

## 2. How It Works

1. User deposits G$ into `CollateralVault` (minimum 150% collateral ratio)
2. User mints synthetic shares (e.g., sAAPL = 1 Apple share)
3. Chainlink oracles keep prices pegged to real-world equity prices
4. User burns synthetic shares to recover collateral
5. 0.3% fee on mint/burn → UBI fee splitter (33% → UBI pool)

---

## 3. User Stories

| As a | I want to | So that |
|------|-----------|---------|
| Global user | Buy fractional US stocks without a broker | I can invest regardless of geography |
| G$ holder | Put my G$ to work earning stock exposure | My UBI income builds wealth |
| Liquidator | Monitor and liquidate underwater positions | I earn a 10% bonus on seized collateral |
| Admin | List new stock tickers | I can expand the tradable universe |

---

## 4. Contract Architecture

### 4.1 PriceOracle
- Wraps Chainlink AggregatorV3 feeds
- 1-hour staleness threshold (configurable)
- Manual price override for testing/emergency
- Admin-managed feed registry

### 4.2 SyntheticAssetFactory
- Deploys one `SyntheticAsset` ERC-20 per ticker (e.g., sAAPL, sMSFT)
- `vault` address set as sole minter on deployment
- Maintains enumerable registry of listed stocks

### 4.3 SyntheticAsset (ERC-20)
- Standard ERC-20 with mint/burn restricted to `minter` (CollateralVault)
- Symbol: `s{TICKER}` (e.g., sAAPL, sMSFT, sTSLA)
- Decimals: 18 (1e18 = 1 share)

### 4.4 CollateralVault (Core)
- **Collateral:** G$ (1:1 USD approximation)
- **Min collateral ratio:** 150% (15000 BPS)
- **Liquidation threshold:** 120% (12000 BPS)
- **Trade fee:** 0.3% on notional (30 BPS)
- **Liquidation bonus:** 10% of seized collateral to liquidator
- **Fee routing:** All fees → `UBIFeeSplitter.splitFee()`

---

## 5. Fee Model

| Fee | Rate | Destination |
|-----|------|-------------|
| Mint fee | 0.3% of position value | UBIFeeSplitter |
| Burn fee | 0.3% of position value | UBIFeeSplitter |
| Liquidation remainder | ~90% of seized collateral | UBIFeeSplitter |

UBIFeeSplitter splits: 33% → UBI pool, 17% → protocol treasury, 50% → dApp.

---

## 6. Risk Management

### Collateralization
- Positions must maintain >150% CR at all times
- `withdrawCollateral` enforces the ratio check
- Price crashes trigger liquidations at 120%

### Oracle Risk
- 1-hour staleness revert protects against stale feeds
- Manual override for emergency circuit-breaker

### Liquidation Economics
- At 120% CR: $1.20 collateral backing $1.00 debt
- Liquidator receives 10% bonus: ~$0.12 profit per $1.00 liquidated
- Remaining ~$0.08 goes to UBI (not lost)

---

## 7. Supported Assets (Phase 1)

| Ticker | Name | Chainlink Feed |
|--------|------|----------------|
| AAPL | Apple Inc. | AAPL/USD |
| MSFT | Microsoft Corp. | MSFT/USD |
| TSLA | Tesla Inc. | TSLA/USD |
| GOOGL | Alphabet Inc. | GOOGL/USD |
| AMZN | Amazon.com Inc. | AMZN/USD |

---

## 8. Roadmap

| Phase | Feature |
|-------|---------|
| 1 (current) | Core collateral vault, 5 US equities |
| 2 | Multi-collateral (USDC, ETH as collateral) |
| 3 | ETF synthetics (SPY, QQQ) |
| 4 | International equities (BABA, Toyota) |
| 5 | Governance for listing new assets |
