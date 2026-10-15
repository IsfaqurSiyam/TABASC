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
settings. The backend requires a JWT secret and wallet passphrase of at least
32 characters, a valid local MongoDB URL, local Ganache URL, admin credentials,
and the configured frontend origin.

After migrating contracts, run `npm run sync:env --prefix client` to update the
deployed contract addresses in `client/.env`. The script preserves other
settings and the existing line-ending style.

Start the backend with `npm start --prefix client` after MongoDB, Ganache, and
the contracts are available. `GET /api/health` reports database, chain,
contract-code, and pending-sync status.

Verify a registered product's canonical data hash with
`GET /api/verify/<blockchainId>`. If a blockchain transaction succeeds but its
MongoDB write fails, the API records a pending sync and returns `202`; rerun
`npm run reconcile --prefix client` to safely retry those writes. The latest
reconciliation result and remaining pending-sync count are available from the
admin overview.

Create the first administrator with `npm run seed:admin --prefix client`.
After a contract redeployment, restore approved on-chain roles with
`npm run sync:roles --prefix client`.

Back up MongoDB with `mongodump` before running `npm run migrate:wallets
--prefix client`; that script replaces legacy wallet addresses while retaining
them in `legacyWallet`.

For an isolated local test instance, append `-- --port 8546 --db-path
<folder>` to the Ganache start command.
