# Public Readiness Notes

This public tree intentionally excludes local/runtime artifacts and secrets:

- `.env` and machine-local credential files
- Foundry `cache/`, `broadcast/`, `out/` artifacts
- Anvil state dumps and runtime DB files
- Playwright/test screenshots and logs
- compiled JS `dist/` and frontend build outputs

Operational secrets must be injected through deployment secret managers and never committed.
Default Anvil keys in scripts/tests are for local development only and must never fund real accounts.
