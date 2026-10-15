# Local development

Use Node.js and MongoDB locally. Start the persistent, deterministic Ganache
development chain with:

```powershell
npm run ganache:start --prefix client
```

This binds to `127.0.0.1:8545`, uses network ID `5777`, and retains chain data
in `ganache-data`. The command uses Ganache bundled with Truffle; no additional
package is required. It uses deterministic development-only accounts. Do not
use the development mnemonic or these accounts for real funds.

Copy `.env.example` to `client/.env` and replace the placeholder secrets and
settings. Backend startup requires a JWT secret and wallet passphrase of at
least 32 characters, a valid local MongoDB URL, local Ganache URL, a positive
wallet funding amount, token expiry, and the configured frontend origin.
`ADMIN_EMAIL` and `ADMIN_PASSWORD` are only required when explicitly running
the administrator-seeding script.
Before startup, confirm every key in `.env.example` is present in
`client/.env`. Keep the wallet passphrase consistent with existing encrypted
wallets; changing it can make those wallets unusable.

After migrating contracts, run `npm run sync:env --prefix client` to update the
deployed contract addresses in `client/.env`. The script preserves other
settings and the existing line-ending style.

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

Back up MongoDB with `mongodump` before running `npm run migrate:wallets
--prefix client`; that script replaces legacy wallet addresses while retaining
them in `legacyWallet`.

For an isolated local test instance, append `-- --port 8546 --db-path
<folder>` to the Ganache start command.
