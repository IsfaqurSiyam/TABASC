# Local development

Use Node.js and MongoDB locally. Run Ganache from the repository root with
Ganache CLI 7.9.1 available on `PATH`:

```powershell
ganache --wallet.mnemonic "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat" --server.host 127.0.0.1 --server.port 8545 --chain.networkId 5777 --database.dbPath .\ganache-data
```

This uses deterministic development-only accounts and retains chain data in
`ganache-data`. Do not use the mnemonic or these accounts for real funds.

After migrating contracts, run `npm run sync:env --prefix client` to update the
deployed contract addresses in `client/.env`. The script preserves other
settings and the existing line-ending style.
