# TABASC verification and extension log

## Baseline — 2026-10-22

| Check | Result |
|---|---|
| Branch | `fix/checkup` |
| `npm ci --prefix client` | Completed; 0 vulnerabilities |
| `npm ci --prefix frontend` | Completed; dependency audit reported 1 high-severity `follow-redirects` advisory |
| `npx truffle version` | Truffle 5.11.5, Ganache 7.9.1, Solidity 0.8.19 |
| `npm run contracts:compile --prefix client` | Passed; artifacts already up to date |
| `npm run contracts:test --prefix client` | Reported 0 tests because the Truffle config resolves its test directory relative to the client working directory |
| `npx truffle test --config truffle-config.js` (repository root) | 17 passing |
| `npm test --prefix client` | 14 passing |
| `npm test --prefix frontend` | 9 passing |
| MongoDB listener | Available on local port 27017 |
| API `GET /api/health` | Not verified: backend startup refused because the freshly started local Ganache has no deployed contracts. No migration was performed for this baseline. |
| Frontend production build | Not run in baseline phase |

The Truffle test command mismatch and missing build artifacts in a fresh clone
are tracked under M6. The backend test command passed here because ignored
contract artifacts already existed in the working tree.

## Finding verdicts

| ID | Verdict | Evidence | Action | Commit |
|---|---|---|---|---|
