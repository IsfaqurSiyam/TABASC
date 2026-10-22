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
| M2 | CONFIRMED | Public batch serialization included `qrCode`, farmer wallet and populated owner data; `/api/qr/seller/:walletAddress` was anonymous and returned profile fields; public tracking history included on-chain actor wallets. The scan page also used the farmer wallet solely to fetch the public reputation summary. | Fixed by removing QR payloads from all serialized product responses, limiting public product provenance to farmer name/location, restricting seller lookup to the account owner/admin, redacting actor wallets from public tracking history, and replacing the scan page's wallet-based reputation lookup with a product-batch lookup that returns only the score summary. Added a serializer regression test. After fix: contracts 20, backend 19, frontend 11; production build passed. | d5e7907 |
| M3 | CONFIRMED | Wallet creation and decryption use the configured `WALLET_PASSPHRASE`; Ganache account 0 is derived from the development mnemonic and acts as admin; account registration funded the wallet before approval. | Fixed: registration now creates the encrypted wallet without funding it; first admin activation funds the wallet and returns the funding transaction hash. Deactivation/reactivation does not trigger another funding transfer. Wallet migration still funds only already-active, approved users; pending users are funded on approval. No key-custody redesign. Backend regression covers no registration funding and one-time activation funding. After fix: contracts 20, backend 19, frontend 11; production build passed. | aacd0e3 |
| M4 | CONFIRMED | `GET /api/tracking/:blockchainId` reads shipment history from `TrackingContract.getHistory` but appends handover, buyer and recall events from MongoDB `TrackingEvent`. The endpoint does not query chain logs for those event types. | Documented the split source of truth and the possibility that public journeys lag or omit events until pending MongoDB synchronization is reconciled. No indexer added. | ebb81f3 |
| M5.1 | CONFIRMED | No response interceptor existed; auth was persisted in `localStorage` and 401 responses were not centrally handled. | Fixed with one Axios interceptor that clears the current user/token/header and routes to `/login` on 401. Token remains in `localStorage` as requested. After fix: contract 20, backend 18, frontend 11; production build passed. | 60b2d83 |
| M5.2 | UNVERIFIED | Product API defaults to 25 and clients ignore `X-Total-Count`, but the local database has only one active product and there is no browser session to inspect a >25-product view. | Leave pagination/display unchanged until an isolated >25-product UI scenario can be run. | — |
| M6 | CONFIRMED | Fresh Git archive with dependencies resolved externally initially failed `npm test --prefix client` on missing `build/contracts/RoleRegistry.json`. The client Truffle command reported 0 tests; repo-root command found 20. A second fresh Git archive after the fix compiled contracts through `pretest` and passed all 18 then-current backend tests. | Fixed by declaring Truffle 5.11.5 at root, anchoring Truffle's test directory, forwarding client contract commands to root, and compiling in client `pretest`. Setup docs now require root `npm ci`. Validation after fix: contracts 20, backend 18 at M6 commit (19 after M2), frontend 11; production build passed. | 3a60e1c |
| M7 | CONFIRMED | `npm audit --prefix frontend` reported high-severity `follow-redirects` 1.16.0 advisories; `npm audit --prefix client` reported zero vulnerabilities. | Applied frontend-only audit fix to `follow-redirects` 1.16.1. Both audits now report zero vulnerabilities. After fix: contracts 20, backend 19, frontend 11; production build passed. | 8648d36 |
| M8 | CONFIRMED | Live Product collection indexes were `_id`, `blockchainId`, and `batchId`; no `farmer`, `currentOwner`, or `currentStatus` index existed. Active product count was one. | Added individual Product schema indexes for `farmer`, `currentOwner`, and `currentStatus`, with a schema-index regression test. MongoDB builds declared indexes when the model initializes; no live migration was run. Documented that tracking/reputation contract arrays remain unbounded. After fix: contracts 20, backend 20, frontend 11; production build passed. | a71c156 |
| L1 | CONFIRMED | Injected a QR provider error and reproduced the route's custom 500 response path; the old response bypassed the central handler and included the underlying error message. | Forwarded all QR route failures to the central error handler and added a regression asserting diagnostics are not returned. After fix: contracts 20, backend 21, frontend 11; production build passed. | 3cd4a9d |
| L2 | CONFIRMED | A frontend test using batch ID `BATCH/17` failed because the consumer lookup interpolated the slash as a route separator; `ProductScan` used the same raw interpolation. | Encoded batch IDs in both public scan and consumer product lookups. Added a slash-containing consumer batch regression. After fix: contracts 20, backend 22, frontend 11; production build passed. | c386569 |
| L3 | CONFIRMED | QR scan links were derived from the CORS origin, coupling browser-access policy to the public app URL. | Added optional `PUBLIC_APP_URL` for generated QR links and validation, with fallback to `CORS_ORIGIN` for compatibility. Added config tests for override/fallback and updated setup documentation. After fix: contracts 20, backend 22, frontend 11; production build passed. | c386569 |
| L4 | CONFIRMED | A Mongoose model test reproduced preserving a checksummed mixed-case wallet address; seller lookup and admin seed lookup did not consistently normalize inputs. | Added the lowercase setter to `User.walletAddress` and normalized the admin seed lookup; the seller lookup already normalizes its request input. Added a schema regression test. After fix: contracts 20, backend 23, frontend 11; production build passed. | 6f63da0 |
| L5 | CONFIRMED | A timestamp reproduction produced locale-specific `10/22/2026, 10:00:00 PM` instead of stable ISO `2026-10-22T16:00:00.000Z`; tracking and reputation endpoints used `toLocaleString()`. | Replaced server-local date formatting with ISO-8601 in tracking and reputation API responses. After fix: contracts 20, backend 23, frontend 11; production build passed. | f611ce1 |
| L6 | CONFIRMED | `sendFromWallet` passed the exact estimate to the signed transaction; a gas-margin regression initially failed, and a custom-error selector was otherwise reported only as a generic state conflict. | Applies a 20% gas margin before balance checking/signing and maps common Solidity custom errors to specific API codes/messages, retaining the generic conflict for unknown reverts. Added gas-margin and encoded-error regression tests. After fix: contracts 20, backend 25, frontend 11; production build passed. | 15164a0 |
| L7 | CONFIRMED | A strict Truffle reproduction showed a 121-byte product name was accepted; the prior test helper accidentally counted its own "Expected transaction to revert" assertion as a revert. Backend UTF-8 validation also accepted an over-limit value because `maxLength` was unsupported. | Enforced aligned UTF-8 byte limits in Product/Tracking contracts, API validation, and relevant frontend forms; custom `FieldTooLong` errors map to a clear API message. Corrected the Truffle revert helper and added oversized contract-string and UTF-8 backend regression tests. After fix: contracts 21, backend 26, frontend 11; production build passed. Contract changes require redeployment. | 2cc7971 |
| L8 | CONFIRMED | A Truffle reproduction sold two products, recalled them, then showed `recordBuyer` still succeeded; source inspection showed `submitFeedback` likewise lacked the backend's recall guard. | Both contracts now reject buyer records and feedback for recalled products. Added a Truffle regression for each. After fix: contracts 22, backend 26, frontend 11; production build passed. Contract changes require redeployment. | 6d1fd32 |
| L9 | CONFIRMED | `FIXES_DOCUMENTATION.md` described obsolete `.js` component paths, a token returned at registration, an immediate role-based registration flow, and bcrypt cost 10; current code uses `.jsx`, inactive pending accounts, no registration token, and bcrypt cost 12. | Replaced it with accurate current registration/approval/funding behavior, the promise-based Mongoose hook explanation, current file names, and the test command. | c098274 |

## Phase 3 design gate

The UI/docs found so far call this lifecycle state “Delivered” or describe
receipt at a store, but do not define its timestamp as arrival at a distributor
warehouse. The requested feature requires that exact definition to calculate
storage duration. Stop before implementing the attestation until the project
owner chooses the authoritative storage-start and handover timestamps.

## M3 custodial-wallet limitations

Wallet keystores share the configured `WALLET_PASSPHRASE`, so compromise of
that secret can expose all stored wallets. The development Ganache mnemonic is
deterministic and its account 0 is the configured administrator/funder; it is
for local development only, not a production root of trust. Moving customer
keys to an HSM or user-controlled signing is outside this checkup.

## M4 chain/database drift limitation

Public tracking journeys read shipment stages from the tracking contract, but
custody transfers, buyer records and recalls are appended from MongoDB event
documents. If a chain transaction succeeds while the database write is
pending or permanently fails, the public journey can temporarily omit or
continue to omit those events until reconciliation succeeds. A chain-log
indexer is a future reliability improvement and was not added here.

## M8 on-chain scale limitation

Tracking and reputation histories use on-chain arrays that grow with every
record and are not paginated or bounded. MongoDB query indexes improve local
product lookups but do not address contract storage growth or read cost.

## Phase 4 final validation — 2026-10-22

| Check | Result |
|---|---|
| `npm run contracts:test --prefix client` | 22 passing |
| `npm test --prefix client` | 26 passing |
| `npm test --prefix frontend` | 11 passing |
| `npm run build --prefix frontend` | Passed |
| `npm audit --prefix frontend` | 0 vulnerabilities |
| `npm audit --prefix client` | 0 vulnerabilities |
| API `GET /api/health` | Not verified: this environment has no deployed contract code at the configured addresses. |
| Contract migration and `sync:env` / `sync:roles` | Not run; contract changes require redeployment, and migration creates new instances without copying prior chain state. |

Truffle emitted a non-fatal µWS native-binary compatibility warning under the
installed Node.js version and used its JavaScript fallback for the passing
contract suite.

## Outstanding verification and owner decisions

- **UNVERIFIED — M5.2:** Verify the rendered list with more than 25 products.
  This requires an isolated database fixture containing at least 26 products
  and a browser-capable UI run. The API pagination and client display behavior
  remain unchanged.
- **Phase 3 timestamp decision:** Confirm whether storage starts at the
  distributor's `Delivered` timestamp and ends at the on-chain
  distributor-to-retailer handover timestamp. The attestation feature remains
  unimplemented until this is confirmed.
- **M1.1:** Decide whether scoring waits for a feedback period/deadline or an
  explicit close action before finalization.
- **M1.4:** Decide whether trust labels require a minimum number of finalized
  batches.
- **M1.6:** Decide whether retailers may assign buyers without buyer
  acknowledgment or purchase proof.
- **M1.7:** Decide whether reputation configuration changes need versioning
  and whether prior scores should ever be recomputed.
- **Phase 3 reputation policy:** Decide whether failed care checklist items
  should affect a distributor's score later; scoring was not changed here.

## Existing-data and deployment effects

- H2 changes only newly registered products; previously stored delivery-window
  values were not rewritten.
- H3 leaves legacy shared-Batch reputation fields untouched because they do
  not identify the stakeholder and cannot be safely backfilled.
- Contract changes under M1, L7 and L8 require redeployment. A deployment
  creates new contract instances and does not copy prior on-chain state; no
  migration or environment/role synchronization was run in this checkup.
- Wallet registration now defers funding until first admin activation;
  existing active wallets were not changed by this flow update.
