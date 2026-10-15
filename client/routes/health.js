const express = require('express');
const mongoose = require('mongoose');
const { web3, getContractCodeStatus } = require('../blockchain/web3');

const router = express.Router();

router.get('/health', async (req, res, next) => {
  try {
    const databaseReady = mongoose.connection.readyState === 1;
    const [chain, contracts] = await Promise.all([
      web3.eth.getChainId().then((chainId) => ({ status: 'ok', chainId: Number(chainId) }))
        .catch(() => ({ status: 'error' })),
      getContractCodeStatus()
    ]);

    let pendingSyncs = null;
    if (databaseReady && mongoose.connection.db) {
      pendingSyncs = await mongoose.connection.db
        .collection('pendingsyncs')
        .countDocuments({ status: { $ne: 'resolved' } });
    }

    const contractStatus = Object.fromEntries(
      Object.entries(contracts).map(([name, result]) => [
        name,
        result.error ? { status: 'error' } : {
          status: result.hasCode ? 'ok' : 'missing_code',
          address: result.address
        }
      ])
    );
    const healthy = databaseReady &&
      chain.status === 'ok' &&
      Object.values(contracts).every((contract) => !contract.error && contract.hasCode);

    return res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'error',
      database: { status: databaseReady ? 'ok' : 'error' },
      ganache: chain,
      contracts: contractStatus,
      pendingSyncs
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
