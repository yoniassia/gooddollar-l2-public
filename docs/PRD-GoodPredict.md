# GoodPredict — Product Requirements Document

**Version:** 1.0 | **Status:** Contracts shipped (commit 00166ca) | **Author:** Protocol Engineer

---

## 1. Overview

GoodPredict is a binary outcome prediction market on GoodDollar L2. Users bet on real-world events using G$. A 1% fee on winning payouts funds universal basic income.

**Core proposition:** Aggregate global beliefs into accurate probability signals — while every winning bet contributes to UBI.

---

## 2. How It Works

1. Admin creates a market with a question and resolution deadline
2. Anyone buys YES or NO tokens at 1 G$ each (1:1 collateral backing)
3. After the deadline, a designated resolver calls `resolve(YES/NO)`
4. Winners redeem their outcome tokens for a pro-rata share of the total collateral pot, minus 1% fee
5. 1% fee → UBI fee splitter (33% → UBI pool)

**Price discovery:** Implied probability = YES tokens / (YES + NO tokens). Moves continuously as trades happen.

---

## 3. User Stories

| As a | I want to | So that |
|------|-----------|---------|
| Bettor | Buy YES/NO on any open market | I can profit from my predictions |
| Market maker | Buy both sides to earn fees | I profit from providing liquidity |
| Resolver | Resolve markets accurately | Trusted outcomes are settled |
| Winner | Redeem tokens after resolution | I collect my winnings |
| Admin | Create and void markets | I manage the market lifecycle |

---

## 4. Contract Architecture

### 4.1 ConditionalTokens (ERC-1155)
- Token IDs: `YES = marketId * 2`, `NO = marketId * 2 + 1`
- Only `MarketFactory` can mint/burn
- Standard ERC-1155 transfer and batch transfer
- No URI or metadata (pure logic tokens)

### 4.2 MarketFactory
- Creates binary markets with `question`, `endTime`, `resolver`
- Trading: `buy(marketId, isYES, amount)` — 1 G$ per token
- Resolution: `closeMarket()` → `resolve(yesWon)` → `redeem()`
- Void: admin can void markets for full 1:1 collateral return
- Fee: 1% of winning payout to `feeSplitter`

---

## 5. Market Lifecycle

```
Created → Open (trading active) → Closed (after endTime) → Resolved (YES/NO) → Redeemed
                                                         → Voided (emergency)
```

| Status | Trading | Redemption |
|--------|---------|------------|
| Open | ✓ | ✗ |
| Closed | ✗ | ✗ |
| ResolvedYES | ✗ | YES holders only |
| ResolvedNO | ✗ | NO holders only |
| Voided | ✗ | Both (1:1, no fee) |

---

## 6. Fee Model

| Scenario | Fee | Destination |
|----------|-----|-------------|
| Winner redeems | 1% of payout | UBIFeeSplitter |
| Loser (no redemption) | 100% of bet | Redistributed to winners |
| Void redemption | 0% | Returned 1:1 |

On a market where 300 YES and 100 NO tokens are sold:
- YES wins: each YES token redeems for 400/300 ≈ 1.333 G$ before 1% fee → ~1.320 G$
- Per token profit: ~0.320 G$ (32% return)

---

## 7. Resolver System

| Resolver type | Description |
|--------------|-------------|
| Admin (default) | Trusted admin for MVP |
| External oracle | Chainlink or custom oracle contract |
| DAO governance | Multi-sig or on-chain vote (Phase 2) |
| Kleros court | Decentralized dispute resolution (Phase 3) |

---

## 8. Category Examples (Phase 1)

- **Crypto:** "Will BTC exceed $100k by 2026 EOY?"
- **Macro:** "Will the US Fed cut rates before June?"
- **GoodDollar:** "Will G$ daily active users exceed 500k by Q3?"
- **Sports:** "Will Brazil win the 2026 World Cup?"
- **AI:** "Will GPT-5 score >90% on MMLU benchmark?"

---

## 9. Roadmap

| Phase | Feature |
|-------|---------|
| 1 (current) | Binary markets, admin resolver |
| 2 | Multi-outcome markets (3+ outcomes) |
| 3 | Automated resolution via Chainlink |
| 4 | Order-book style trading (CLOB) |
| 5 | DAO governance for market creation |
