# GoodPerps — Product Requirements Document

**Version:** 1.0 | **Status:** Contracts shipped (commit 1d4ea09) | **Author:** Protocol Engineer

---

## 1. Overview

GoodPerps is a perpetual futures DEX on GoodDollar L2. Traders open leveraged long/short positions on BTC, ETH, and other assets using G$ as margin. Every trade contributes to UBI.

**Core proposition:** Hyperliquid-class perpetuals for everyone — funded by fees that flow to humanity's poorest people.

---

## 2. How It Works

1. User deposits G$ into `MarginVault`
2. User opens a long or short position with up to 50x leverage
3. Mark price tracked via Chainlink oracle (PriceOracle)
4. 8-hour funding rate equalizes longs and shorts: longs pay shorts when mark > index
5. User closes position; PnL and funding settled against margin
6. Liquidation at 2% maintenance margin ratio (5% bonus to liquidator)
7. 0.1% trade fee on notional → UBI fee splitter

---

## 3. User Stories

| As a | I want to | So that |
|------|-----------|---------|
| Trader | Open leveraged long/short on BTC/ETH | I profit from directional market moves |
| Hedger | Short my spot BTC holdings | I reduce portfolio risk without selling |
| Liquidator | Liquidate underwater positions | I earn 5% bonus on seized margin |
| LPs (Phase 2) | Provide liquidity to the perps pool | I earn a portion of trading fees |

---

## 4. Contract Architecture

### 4.1 MarginVault
- Holds G$ collateral deposits
- Engine-only `debit` / `credit` / `transfer` (access control)
- Users deposit/withdraw directly
- Tracks per-user balances; margin stays in vault during open positions

### 4.2 FundingRate
- 8-hour funding intervals (configurable)
- Formula: `rate = clamp((markPrice - indexPrice) / indexPrice, -0.05%, +0.05%)`
- Cumulative funding index per market enables O(1) settlement
- Engine or admin can trigger funding update
- Longs pay shorts during premium (mark > index); reverse during discount

### 4.3 PerpEngine (Core)
- Creates markets with oracle key and max leverage
- `openPosition(marketId, size, isLong, margin)` — reserves margin
- `closePosition(marketId)` — settles PnL + funding
- `liquidate(trader, marketId)` — available below 2% margin ratio
- Tracks `openInterestLong` and `openInterestShort` per market

---

## 5. Fee Model

| Fee | Rate | Destination |
|-----|------|-------------|
| Open/close trade | 0.1% on notional | UBIFeeSplitter |
| Liquidation bonus | 5% of remaining margin | Liquidator's vault balance |
| Funding payment | ±0.05% max per 8h | Counter-party traders |

---

## 6. Position Mechanics

### PnL Calculation
```
PnL = size × (exitPrice - entryPrice) / entryPrice  [long]
PnL = size × (entryPrice - exitPrice) / entryPrice  [short]
```

### Funding Settlement
```
accrued = size × (cumulativeIndex_now - cumulativeIndex_entry)
netPnL = tradePnL - accruedFunding
```

### Margin Ratio
```
marginRatio = (margin + unrealizedPnL) / notionalSize
Liquidatable when marginRatio < 2%
```

### Leverage Example
| Deposit | Position Size | Leverage | Liq. Price (long, $50k entry) |
|---------|--------------|----------|-------------------------------|
| $10,000 | $100,000 | 10x | ~$49,000 (2% drop) |
| $10,000 | $200,000 | 20x | ~$49,500 (1% drop) |
| $10,000 | $500,000 | 50x | ~$49,800 (0.4% drop) |

---

## 7. Markets (Phase 1)

| Pair | Oracle | Max Leverage |
|------|--------|-------------|
| BTC-PERP | Chainlink BTC/USD | 50x |
| ETH-PERP | Chainlink ETH/USD | 50x |
| G$-PERP | Internal G$/USD | 20x |
| SOL-PERP | Chainlink SOL/USD | 20x |
| LINK-PERP | Chainlink LINK/USD | 20x |

---

## 8. Insurance Fund (Phase 2)

When a position is liquidated below 0% (bankrupt), the insurance fund covers the deficit. In Phase 1, bankruptcies result in socialized losses (other traders absorb). Phase 2 adds an `InsuranceFund` contract funded by a portion of trade fees.

---

## 9. Roadmap

| Phase | Feature |
|-------|---------|
| 1 (current) | Isolated margin, 5 markets, Chainlink prices |
| 2 | Cross-margin mode, InsuranceFund contract |
| 3 | On-chain CLOB order book (limit orders) |
| 4 | Portfolio margin mode |
| 5 | Options and structured products |
