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

After migrating contracts, run `npm run sync:env --prefix client` to update the
deployed contract addresses in `client/.env`. The script preserves other
settings and the existing line-ending style.

For an isolated local test instance, append `-- --port 8546 --db-path
<folder>` to the Ganache start command.
