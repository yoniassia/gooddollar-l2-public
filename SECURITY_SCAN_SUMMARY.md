# Security Scan Summary — Public Release

Date: 2026-05-13 UTC

## Gates run

- `forge build` on the sanitized public source tree: pass.
- Secret-pattern scan for common live credentials: pass, 0 hits.
- Slither static scan: completed.
- Bounded Mythril symbolic scans on `UBIFeeSplitter`, `ValidatorStaking`, and `FastWithdrawalLP`: 0 reported issues.

## Fixes applied before publication

- Removed private/runtime artifacts and local state from the public tree.
- Replaced unsafe tracked environment/local artifacts with `.gitignore` protections.
- Fixed unchecked ERC-20 `transferFrom` returns in:
  - `src/UBIFeeSplitter.sol`
  - `src/ValidatorStaking.sol`
  - `src/ValidatorStakingDevnet.sol`
- Removed stale deployment/fix scripts and tests from the sanitized public mirror because several were devnet-local, compile-broken, or contained default development keys.
- Fixed duplicate interface declarations around stable fee-splitter interfaces.

## Remaining Slither manual-review items

Slither still reports high-severity patterns that require human triage before production/mainnet use:

- `arbitrary-send-erc20` in lending/yield flows: mostly expected vault/reserve transfer design, but should be reviewed against authorization invariants.
- `arbitrary-send-eth` in bridge/timelock flows: expected bridge/timelock behavior, but should be reviewed against proof/executor controls.
- `weak-prng` in `VaultManager._rpow`: false-positive-looking exponent parity logic, not randomness.
- `reentrancy-eth` in `FastWithdrawalLP.claimFastETHWithdrawal`: function is `nonReentrant` and updates key state before external calls, but deserves manual audit before production.

This public repository is safe to publish from a secrets/history perspective, but it is not a production audit sign-off.
