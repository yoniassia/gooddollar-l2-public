# Security Policy

GoodDollar L2 is prototype/devnet software. Do not deploy with real funds without an independent audit.

## Public-release hygiene performed before this repository was published

- Removed tracked `.env` and machine-local credential files.
- Removed Foundry `cache/`, `out/`, `broadcast/`, local Anvil state, runtime DBs, logs, and generated build/test artifacts.
- Rewrote Git history for this public mirror to a clean initial commit; private development history was not exposed.
- Ran literal secret-pattern checks for GitHub PATs, OpenAI-style keys, AWS access keys, JWTs, and PEM private keys: 0 hits in the public tree.
- Fixed unchecked ERC-20 `transferFrom` handling in core staking/fee-splitter paths.
- Verified contract source build with Foundry.
- Ran Slither and bounded Mythril scans; remaining Slither highs are documented as manual-review items, mostly expected bridge/timelock/lending transfer patterns and one nonReentrant fast-withdrawal triage item.

## Reporting

Please open a private security issue or contact the GoodDollar maintainers before disclosing exploitable findings publicly.
