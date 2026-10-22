# Local development

Use Node.js and MongoDB locally. Install the root Truffle toolchain and the
application dependencies:

```powershell
npm ci
npm ci --prefix client
npm ci --prefix frontend
```

The root package declares the Truffle version used for compilation, migrations,
and contract tests. `npm test --prefix client` compiles contracts first, so a
fresh clone does not need ignored `build/contracts` artifacts.

Start the persistent, deterministic Ganache development chain with:

```powershell
npm run ganache:start --prefix client
```

This binds to `127.0.0.1:8545`, uses network ID `5777`, and retains chain data
in `ganache-data`. It uses deterministic development-only accounts. Do not
use the development mnemonic or these accounts for real funds.

Copy `.env.example` to `client/.env` and replace the placeholder secrets and
settings. Backend startup requires a JWT secret and wallet passphrase of at
least 32 characters, a valid local MongoDB URL, local Ganache URL, a positive
wallet funding amount, token expiry, and the configured frontend origin.
Set optional `PUBLIC_APP_URL` to the public frontend origin used when generating
product QR links; it defaults to `CORS_ORIGIN` for existing installations.
`ADMIN_EMAIL` and `ADMIN_PASSWORD` are only required when explicitly running
the administrator-seeding script.
Before startup, confirm every key in `.env.example` is present in
`client/.env`. Keep the wallet passphrase consistent with existing encrypted
wallets; changing it can make those wallets unusable.

After a contract change, redeploy in this order:

```powershell
npm run contracts:compile --prefix client
npm run contracts:migrate --prefix client
npm run sync:env --prefix client
npm run sync:roles --prefix client
```

Migration deploys new contract instances; it does not copy prior contract
state. The environment-sync script preserves other settings and line endings.

Start the backend with `npm start --prefix client` after MongoDB, Ganache, and
the contracts are available. `GET /api/health` reports database, chain,
contract-code, and pending-sync status.

Run the Vite frontend with `npm start --prefix frontend`; the default API base
URL is `http://localhost:5000/api`. Set `VITE_API_URL` in `frontend/.env` when
the backend uses a different URL. Run frontend tests with
`npm test --prefix frontend` and create a production bundle with
`npm run build --prefix frontend`.

Before release, run `npm test --prefix client`, `npm run contracts:test
--prefix client`, `npm test --prefix frontend`, and
`npm run build --prefix frontend`. Check runtime readiness with
`GET /api/health`; it reports database, chain, deployed-contract, and pending
synchronization status without changing application data.

Verify a registered product's canonical data hash with
`GET /api/verify/<blockchainId>`. If a blockchain transaction succeeds but its
MongoDB write fails, the API records a pending sync and returns `202`; rerun
`npm run reconcile --prefix client` to safely retry those writes. The latest
reconciliation result and remaining pending-sync count are available from the
admin overview. Inspector scoring records immutable quality and compliance
values on-chain, then finalizes a score only for an actual journey participant.
Public scan pages use `GET /api/products/batch/<batchId>`,
`GET /api/tracking/<blockchainId>`, and
`GET /api/reputation/product/<batchId>`; the reputation endpoint returns only
the farmer's score summary and does not expose their wallet address.
Distributor-to-retailer custody transfer requires a care attestation:
`POST /api/products/<productId>/handover` accepts the existing `email` plus
`care.temperatureMaintained`, `care.packagingIntact`, `care.hygieneMaintained`,
`care.noDamageOrSpoilage`, and a required `explanation`. A failed checklist
item requires at least 20 UTF-8 bytes of explanation; explanations are limited
to 500 bytes. The distributor form's
`GET /api/products/<productId>/care-preview` reports the on-chain `Delivered`
timestamp and elapsed storage. `GET /api/tracking/<blockchainId>/care` returns
the immutable on-chain attestation (or `hasAttestation: false`) with ISO dates.
Storage starts at the chain's `Delivered` timestamp and ends at the recorded
distributor-to-retailer handover; the contract computes elapsed seconds and
whole storage days. The checklist and explanation are self-declared; only the
duration is verified by chain timestamps. The new contract ABI requires the
full compile, migration, environment sync, and role sync sequence above.
On-chain text is limited to 120 UTF-8 bytes for product names and locations,
64 bytes for batch IDs, and 500 bytes for shipment notes and recall reasons.
Consumer feedback is accepted only from the wallet recorded as the buyer of a
sold, non-recalled product. Reputation writes with pending database
synchronization return `202` and are retried by the same reconciliation command.

Create the first administrator with `npm run seed:admin --prefix client`.
After a contract redeployment, restore approved on-chain roles with
`npm run sync:roles --prefix client`.

Public registration creates a consumer account and may include a request for a
farmer, distributor, retailer, or inspector role. The administrator dashboard
reviews these requests and grants the matching on-chain role before activating
the role in MongoDB. The web dashboards expose the corresponding custody,
shipment, buyer, recall, and product-verification workflows.
Registration displays the current version of the TABASC Participation
Agreement and requires explicit acceptance. The accepted version, agreement
hash, and server-side acceptance time are stored with the account. This
agreement does not create a court process: administrators can deactivate
accounts or revoke approved on-chain roles, while only competent authorities
and courts can decide legal proceedings.
New registrations are inactive and remain pending until an administrator uses
“Approve & activate” in the account list. Pending accounts cannot log in and
receive no login token at registration. Their encrypted wallets are funded on
first activation, not at signup. Administrators can later deactivate or
reactivate approved accounts; pending role requests can be approved only after
the account itself has been approved.
Blockchain transactions estimate gas from the requested operation, verify the
wallet can cover the estimated fee, and check required on-chain roles before
broadcast. Insufficient funds and stale role/state failures return actionable
conflict responses instead of relying on a fixed gas cap.
When a newly deployed or reset development chain reuses a product ID already
stored in MongoDB, reconciliation archives the displaced product and its
related batch, tracking, and review records in the `ArchivedProduct` collection
before syncing the on-chain record. Product registration checks the next chain
ID against MongoDB before submitting, so unresolved legacy ID collisions are
reported before another transaction is sent.
To archive all MongoDB product records whose IDs are beyond the active chain's
product count, run `npm run archive:stale-products --prefix client`. This
preserves their data and related records in `ArchivedProduct` before freeing
those IDs for future registrations.

Back up MongoDB with `mongodump` before running `npm run migrate:wallets
--prefix client`; that script replaces legacy wallet addresses while retaining
them in `legacyWallet`.

For an isolated local test instance, append `-- --port 8546 --db-path
<folder>` to the Ganache start command.
