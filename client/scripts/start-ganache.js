const path = require('path');

const mnemonic = 'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat';
const host = '127.0.0.1';

function resolveGanache() {
  const modulePaths = [
    path.resolve(__dirname, '../node_modules'),
    path.resolve(__dirname, '../../node_modules')
  ];

  for (const entry of process.env.PATH.split(path.delimiter)) {
    modulePaths.push(path.join(entry, 'node_modules', 'truffle'));
    modulePaths.push(path.resolve(entry, '..', 'node_modules', 'truffle'));
  }

  const packagePath = require.resolve('ganache', { paths: modulePaths });
  return require(packagePath);
}

function parseOptions() {
  const options = {
    port: 8545,
    dbPath: path.resolve(__dirname, '../../ganache-data')
  };

  for (let index = 2; index < process.argv.length; index += 1) {
    const name = process.argv[index];
    const value = process.argv[index + 1];
    if (name !== '--port' && name !== '--db-path') {
      throw new Error(`Unknown option: ${name}`);
    }
    if (!value) throw new Error(`Missing value for ${name}`);
    index += 1;

    if (name === '--port') {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('--port must be an integer from 1 to 65535');
      }
      options.port = port;
    } else {
      options.dbPath = path.resolve(value);
    }
  }

  return options;
}

async function main() {
  const options = parseOptions();
  const ganache = resolveGanache();
  const server = ganache.server({
    chain: { networkId: 5777 },
    wallet: { mnemonic },
    server: { host, port: options.port },
    database: { dbPath: options.dbPath },
    logging: { quiet: true }
  });

  await server.listen(options.port, host);
  console.log(
    `Ganache listening at http://${host}:${options.port} (network ID 5777; data: ${options.dbPath})`
  );

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close();
  };
  process.on('SIGINT', () => close().catch((error) => {
    console.error(`Unable to stop Ganache: ${error.message}`);
    process.exitCode = 1;
  }));
  process.on('SIGTERM', () => close().catch((error) => {
    console.error(`Unable to stop Ganache: ${error.message}`);
    process.exitCode = 1;
  }));
}

main().catch((error) => {
  console.error(`Unable to start Ganache: ${error.message}`);
  process.exitCode = 1;
});
