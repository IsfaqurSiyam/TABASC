const fs = require('fs');
const path = require('path');

const networkId = '5777';
const contractNames = [
  'RoleRegistry',
  'ProductContract',
  'TrackingContract',
  'ReputationContract'
];
const envNames = [
  'ROLE_REGISTRY_CONTRACT',
  'PRODUCT_CONTRACT',
  'TRACKING_CONTRACT',
  'REPUTATION_CONTRACT'
];

function getOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function readContractAddress(contractsDirectory, contractName) {
  const artifactPath = path.join(contractsDirectory, `${contractName}.json`);
  const contents = fs.readFileSync(artifactPath, 'utf8').replace(/^\uFEFF/, '');
  const artifact = JSON.parse(contents);
  const address = artifact.networks?.[networkId]?.address;

  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(
      `${contractName} has no valid deployment address for network ${networkId}`
    );
  }

  return address;
}

function updateEnvFile(envPath, addresses) {
  let contents = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const hasByteOrderMark = contents.charCodeAt(0) === 0xfeff;
  if (hasByteOrderMark) {
    contents = contents.slice(1);
  }
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents ? contents.split(/\r?\n/) : [];

  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  for (const [name, address] of Object.entries(addresses)) {
    const matchingLine = new RegExp(`^\\s*${name}\\s*=`);
    let found = false;
    for (let index = 0; index < lines.length; index += 1) {
      if (matchingLine.test(lines[index])) {
        lines[index] = `${name}=${address}`;
        found = true;
      }
    }
    if (!found) {
      lines.push(`${name}=${address}`);
    }
  }

  const directory = path.dirname(envPath);
  fs.mkdirSync(directory, { recursive: true });
  const byteOrderMark = hasByteOrderMark ? '\uFEFF' : '';
  fs.writeFileSync(envPath, byteOrderMark + lines.join(newline) + newline, 'utf8');
}

function main() {
  const projectRoot = path.resolve(__dirname, '../..');
  const contractsDirectory = path.resolve(
    projectRoot,
    getOption('--contracts-dir', path.join(projectRoot, 'build/contracts'))
  );
  const envPath = path.resolve(
    projectRoot,
    getOption('--env-file', path.join(projectRoot, 'client', '.env'))
  );
  const addresses = {};

  for (let index = 0; index < contractNames.length; index += 1) {
    addresses[envNames[index]] = readContractAddress(
      contractsDirectory,
      contractNames[index]
    );
  }

  updateEnvFile(envPath, addresses);
  console.log(`Updated contract addresses in ${envPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Unable to sync contract addresses: ${error.message}`);
  process.exitCode = 1;
}
