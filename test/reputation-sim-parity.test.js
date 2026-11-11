const RoleRegistry = artifacts.require('RoleRegistry');
const ProductContract = artifacts.require('ProductContract');
const TrackingContract = artifacts.require('TrackingContract');
const ReputationContract = artifacts.require('ReputationContract');
const {
  MODEL,
  calculateDeliveryScore,
  combine,
  updateEma
} = require('../client/scripts/baseline-comparison');

contract('Reputation simulation parity', function (accounts) {
  const [admin, farmer, distributor, retailer, inspector, buyer] = accounts;
  const elapsedTargets = [5000, 86400, 95040, 129600, 151200, 172800, 181440, 82080, 108000, 171936];
  const qualities = [10000, 9500, 8000, 6500, 3000, 1000, 9999, 5000, 7500, 2000];
  const compliances = [10000, 9000, 8500, 7000, 4000, 2500, 9999, 5500, 7800, 1000];
  const ratings = [10, 1, 7, 9, 3, 8, 2, 6, 10, 4];
  let registry;
  let product;
  let tracking;
  let reputation;

  const rpc = (method, params = []) => new Promise((resolve, reject) => {
    web3.currentProvider.send(
      { jsonrpc: '2.0', method, params, id: Date.now() },
      (error, response) => {
        if (error) return reject(error);
        if (response.error) return reject(new Error(response.error.message));
        return resolve(response.result);
      }
    );
  });

  const updateShipment = (productId, status, actor) => tracking.updateShipment(
    productId,
    status,
    'Parity test location',
    `status ${status}`,
    web3.utils.keccak256(`${productId}-${status}`),
    { from: actor }
  );

  beforeEach(async () => {
    registry = await RoleRegistry.new({ from: admin });
    await registry.grantRole(await registry.FARMER_ROLE(), farmer, { from: admin });
    await registry.grantRole(await registry.DISTRIBUTOR_ROLE(), distributor, { from: admin });
    await registry.grantRole(await registry.RETAILER_ROLE(), retailer, { from: admin });
    await registry.grantRole(await registry.INSPECTOR_ROLE(), inspector, { from: admin });

    product = await ProductContract.new(registry.address, { from: admin });
    tracking = await TrackingContract.new(registry.address, product.address, { from: admin });
    await product.setTrackingContract(tracking.address, { from: admin });
    reputation = await ReputationContract.new(
      registry.address,
      product.address,
      tracking.address,
      { from: admin }
    );
  });

  it('matches delivery, availability-normalized combination, and EMA for ten finalized batches', async () => {
    const weights = (await reputation.weights()).map(Number);
    const alpha = Number(await reputation.alpha());
    assert.deepEqual(weights, [...MODEL.FACTOR_WEIGHTS_BPS]);
    assert.equal(alpha, MODEL.ALPHA_BPS);

    let previousScore = 0;
    for (let index = 0; index < elapsedTargets.length; index += 1) {
      const batchId = `SIM-PARITY-${index + 1}`;
      const window = 86400;
      const registered = await product.registerProduct(
        `Parity batch ${index + 1}`,
        batchId,
        web3.utils.keccak256(batchId),
        window,
        { from: farmer }
      );
      const productId = registered.logs.find((log) => log.event === 'ProductRegistered').args.productId;
      await tracking.handover(productId, distributor, { from: farmer });
      await updateShipment(productId, 1, distributor);
      await updateShipment(productId, 2, distributor);

      const registeredAt = Number(await product.registeredAtOf(productId));
      const latest = await web3.eth.getBlock('latest');
      const waitSeconds = elapsedTargets[index] - (Number(latest.timestamp) - registeredAt);
      if (waitSeconds > 0) await rpc('evm_increaseTime', [waitSeconds]);
      await updateShipment(productId, 3, distributor);

      await tracking.handoverWithCare(
        productId,
        retailer,
        [true, true, true, true],
        'Parity test storage conditions are within requirements.',
        { from: distributor }
      );
      await updateShipment(productId, 4, retailer);
      await updateShipment(productId, 5, retailer);
      await tracking.recordBuyer(productId, buyer, { from: retailer });
      await tracking.confirmBuyer(productId, { from: buyer });

      const satisfaction = ratings[index] * 1000;
      const complaint = 10000 - satisfaction;
      await reputation.recordInspection(
        productId,
        qualities[index],
        compliances[index],
        { from: inspector }
      );
      await reputation.submitFeedback(productId, complaint, satisfaction, { from: buyer });

      const elapsed = Number(await tracking.actedAtOf(productId, 3)) - registeredAt;
      const actualDeliveryScore = Number(await reputation.deliveryScoreOf(productId));
      assert.equal(
        calculateDeliveryScore(elapsed, window),
        actualDeliveryScore,
        `delivery score mismatch for batch ${index + 1}`
      );

      const values = [
        qualities[index],
        actualDeliveryScore,
        satisfaction,
        compliances[index],
        satisfaction
      ];
      const available = [true, true, true, true, true];
      const jsBatchScore = combine(values, weights, available);
      const contractBatchScore = Number(
        await reputation.combine.call(values, weights, available)
      );
      assert.equal(jsBatchScore, contractBatchScore, `batch score mismatch for batch ${index + 1}`);

      const availabilityCases = [
        [true, false, false, true, false],
        [true, true, false, true, false],
        [true, true, true, true, true]
      ];
      for (const availableFactors of availabilityCases) {
        const jsAvailableScore = combine(values, weights, availableFactors);
        const contractAvailableScore = Number(
          await reputation.combine.call(values, weights, availableFactors)
        );
        assert.equal(
          jsAvailableScore,
          contractAvailableScore,
          `availability normalization mismatch for batch ${index + 1}`
        );
      }

      const expectedScore = updateEma(previousScore, jsBatchScore, index > 0, alpha);
      const simulatedContractScore = Number(
        await reputation.finalizeScore.call(productId, farmer, { from: inspector })
      );
      assert.equal(
        expectedScore,
        simulatedContractScore,
        `EMA score mismatch for batch ${index + 1}`
      );
      await reputation.finalizeScore(productId, farmer, { from: inspector });
      const reputationState = await reputation.getReputation(farmer);
      assert.equal(
        Number(reputationState.scoreBps),
        expectedScore,
        `stored score mismatch for batch ${index + 1}`
      );
      previousScore = expectedScore;
    }
  });
});
