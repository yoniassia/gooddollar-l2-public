# Changelog

All notable changes to the GoodDollar L2 project will be documented in this file.

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and
[release-please](https://github.com/googleapis/release-please) for automated versioning.

## [0.1.0] — 2026-04-04

### Initial Release

- **Contracts:** GoodDollar Token (G$), GoodSwap AMM (Uniswap V4 hooks), UBI Claim V2,
  UBI Fee Splitter, UBI Revenue Tracker, Validator Staking, Agent Registry
- **DeFi Modules:** Oracle, Lending (GoodVault), Perpetuals, Prediction Markets,
  Stablecoin (GUSD), Yield Aggregator, Stock Tokens, Bridge
- **Frontend:** GoodSwap DEX at goodswap.goodclaw.org (Next.js)
- **SDK:** @gooddollar/agent-sdk for AI agent integrations
- **Infrastructure:** Anvil devnet (chain 42069), Block Explorer, PM2 services
- **CI/CD:** GitHub Actions with Forge tests, frontend typecheck, automated releases
