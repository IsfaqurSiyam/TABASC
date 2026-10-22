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
| H1 | CONFIRMED | Truffle reproduction with perfect quality/compliance/delivery returned `ReputationFinalized.batchScore` 8000 for `(complaint 0, satisfaction 10000)` and 8900 for `(9000, 1000)`. | Fixed by combining complaint-free score (`10000 - complaint`); raw feedback remains stored. One rating feeds both complaint and satisfaction components (30% combined default weight), intentionally kept because the API collects one rating and the user-requested correction preserves both component weights. After fix: contract 18, backend 15, frontend 9; production build passed. | 31257cd |
| H2 | CONFIRMED | Farmer form says days; `/products/register` passed the submitted integer unchanged to `ProductContract.registerProduct`; contract compares against elapsed block seconds. The new regression initially failed because the conversion helper did not exist. | Fixed: accepts 1–365 days, converts to seconds before canonical hashing and persistence, and leaves existing on-chain product values unchanged. Validation after fix: contract 17, backend 15, frontend 9; frontend production build passed. | 55014d5 |
| H3 | CONFIRMED | Reproduced in disposable MongoDB `tabasc_checkup`: two stakeholder writes left only the second score/trust/hash on the shared `Batch`. Public leaderboard route had no `protect` and populated farmer email. | Fixed with a unique per-batch/stakeholder score model populated from the on-chain finalization event; public leaderboard returns wallet-based scores without email. Legacy Batch score fields remain, but are no longer updated. Prior legacy rows lack the stakeholder identity and are not backfilled to avoid misattribution. After fix: contract 18, backend 17, frontend 9; production build passed. | a81c9ae |
| H4 | CONFIRMED | `TrackingContract` requires the current custodian to retain distributor role for shipment updates/handover. Existing Truffle role-revocation test demonstrates the role-loss revert; admin revoke/deactivate routes did not check custody. | Fixed by checking current on-chain custody for non-final product IDs before revoking a role or deactivating the account. Error response lists blocking IDs. No contract recovery function added. After fix: contract 18, backend 18, frontend 9; production build passed. | 4357187 |
| M1.1 | CONFIRMED | Truffle test finalized before feedback, recorded a later poor review, and confirmed the score stayed 10000 while a second finalization reverted. | No timing redesign: the contract has no feedback deadline/window and already-finalized scores are immutable. Owner decision needed on whether finalization should wait for a defined window or an explicit close action. | — |
| M1.2 | CONFIRMED | Truffle reproduction successfully finalized a recalled product at 10000. | Fixed by rejecting recalled-product finalization. Included in M1 commit. | 1dad6e9 |
| M1.3 | CONFIRMED | Truffle reproduction granted farmer+inspector roles to one address; that account inspected and finalized its own batch. | Fixed by rejecting inspection/finalization when the inspector is a supply-chain participant. Included in M1 commit. | 1dad6e9 |
| M1.4 | CONFIRMED | A new reputation takes the first `batchScore` directly; the default excellent threshold is 8,000. | No minimum-batch policy added; request owner decision before changing trust labels. | — |
| M1.5 | CONFIRMED | Truffle reproduction registered a `10^18`-second delivery window successfully. | Fixed by limiting contract values to 365 days in seconds; H2 also enforces the same API range. Included in M1 commit. | 1dad6e9 |
| M1.6 | CONFIRMED | `recordBuyer` accepts any nonzero address supplied by the retailer; there is no buyer acknowledgment or proof of purchase. | Preserve the current retailer-assigned buyer flow; request owner decision before introducing purchaser consent. | — |
| M1.7 | CONFIRMED | Admin configuration setters can change weights, alpha and thresholds; finalized scores are stored and are not recomputed. | Preserve existing scores; request owner decision before adding config versioning or recomputation. | — |
| M2 | CONFIRMED | Public batch response serializes the full product (including `qrCode`) and farmer wallet/location; public seller route returns profile fields; public tracking journey is needed by scan pages. | Pending minimization: keep scan-required product provenance/journey, remove embedded QR payloads and restrict unused seller profile lookup. | — |
| M3 | CONFIRMED | Wallet create/decrypt paths use the same configured passphrase; Ganache account 0 is derived from the checked-in development mnemonic and is the admin; registration calls funded `createWallet` before approval. | Pending funding-order fix. Document deterministic mnemonic/custodial-key limitations; do not redesign key custody. | — |
| M4 | CONFIRMED | `GET /api/tracking/:blockchainId` reads lifecycle history from chain but appends handover, buyer and recall events from `TrackingEvent` in MongoDB. | Document drift risk; no indexer in this task. | — |
| M5.1 | CONFIRMED | No response interceptor existed; auth was persisted in `localStorage` and 401 responses were not centrally handled. | Fixed with one Axios interceptor that clears the current user/token/header and routes to `/login` on 401. Token remains in `localStorage` as requested. After fix: contract 20, backend 18, frontend 11; production build passed. | 60b2d83 |
| M5.2 | UNVERIFIED | Product API defaults to 25 and clients ignore `X-Total-Count`, but the local database has only one active product and there is no browser session to inspect a >25-product view. | Leave pagination/display unchanged until an isolated >25-product UI scenario can be run. | — |
| M6 | CONFIRMED | Fresh Git archive with dependencies resolved externally failed `npm test --prefix client` on missing `build/contracts/RoleRegistry.json`. The client Truffle command reported 0 tests; repo-root command found 20. | Fixed by declaring Truffle 5.11.5 at root, anchoring Truffle's test directory, forwarding client contract commands to root, and compiling in client `pretest`. Setup docs now require root `npm ci`. After fix: contracts 20, backend 18, frontend 11; production build passed. | pending |
| M7 | CONFIRMED | `npm audit --prefix frontend` reports high-severity `follow-redirects` 1.16.0 advisories with a fix; client audit reports zero vulnerabilities. | Pending frontend-only `npm audit fix`, then tests/build. | — |
| M8 | CONFIRMED | Live Product collection indexes are `_id`, `blockchainId`, and `batchId`; no `farmer`, `currentOwner`, or `currentStatus` index exists. Active product count was one. | Pending schema indexes; document unbounded on-chain arrays as a scale limitation. | — |
| L1 | CONFIRMED | QR route catches return `error.message` in 500 responses instead of forwarding to central handler. | Pending central error-handler use. | — |
| L2 | CONFIRMED | `ProductScan` interpolates route `batchId` directly; consumer product lookup also interpolates it directly. | Pending URL encoding for both lookups. | — |
| L3 | CONFIRMED | Product QR URLs are built from `CORS_ORIGIN`; no `PUBLIC_APP_URL` config exists. | Pending dedicated public URL config with a backward-compatible local fallback. | — |
| L4 | CONFIRMED | User schema lowercases email but not wallet addresses; seller lookup uses the incoming wallet string exactly. | Pending lowercase on save and lookup. | — |
| L5 | CONFIRMED | Tracking and reputation API responses use server-local `toLocaleString()` timestamps. | Pending ISO-8601 API timestamps. | — |
| L6 | CONFIRMED | Shared sender uses the exact gas estimate with no margin; only a narrow execution-revert shape is mapped. | Pending a modest gas margin and mappings for common transaction reverts. | — |
| L7 | CONFIRMED | Product and tracking contract string fields have no maximum lengths; backend string validation has no `maxLength` rules. | Pending aligned length limits at API and contract boundaries. | — |
| L8 | CONFIRMED | Backend refuses buyer recording/feedback after recall; `TrackingContract.recordBuyer` and `ReputationContract.submitFeedback` do not check recall state. | Pending contract-side recall guards to match backend safety policy. | — |
| L9 | CONFIRMED | `FIXES_DOCUMENTATION.md` describes obsolete API/component filenames, a registration token, and bcrypt cost 10; current code uses a pending-approval flow and bcrypt cost 12. | Pending documentation correction. | — |

## Phase 3 design gate

The UI/docs found so far call this lifecycle state “Delivered” or describe
receipt at a store, but do not define its timestamp as arrival at a distributor
warehouse. The requested feature requires that exact definition to calculate
storage duration. Stop before implementing the attestation until the project
owner chooses the authoritative storage-start and handover timestamps.
