const RoleRegistry = artifacts.require('RoleRegistry');
const ProductContract = artifacts.require('ProductContract');
const TrackingContract = artifacts.require('TrackingContract');
const ReputationContract = artifacts.require('ReputationContract');

contract('TABASC contracts', (accounts) => {
  const [admin, farmer, distributor, retailer, inspector, buyer, otherBuyer, outsider] = accounts;
  let registry;
  let product;
  let tracking;
  let reputation;
  let batchNumber;

  async function expectRevert(action) {
    let revertError;
    try {
      await action;
    } catch (error) {
      revertError = error;
    }
    assert(revertError, 'Expected transaction to revert');
    assert(
      revertError.message.toLowerCase().includes('revert') ||
        revertError.message.toLowerCase().includes('custom error'),
      `Expected a revert, received: ${revertError.message}`
    );
  }

  async function rpc(method, params = []) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        { jsonrpc: '2.0', method, params, id: Date.now() },
        (error, response) => {
          if (error) return reject(error);
          if (response.error) return reject(new Error(response.error.message));
          resolve(response.result);
        }
      );
    });
  }

  async function registerProduct(window = 100) {
    batchNumber += 1;
    const batchId = `BATCH-${batchNumber}`;
    const result = await product.registerProduct(
      `Product ${batchNumber}`,
      batchId,
      web3.utils.keccak256(batchId),
      window,
      { from: farmer }
    );
    return result.logs.find((log) => log.event === 'ProductRegistered').args.productId;
  }

  async function update(productId, status, actor, location = 'Farm') {
    return tracking.updateShipment(
      productId,
      status,
      location,
      `status ${status}`,
      web3.utils.keccak256(`${productId}-${status}`),
      { from: actor }
    );
  }

  async function prepareDelivery(productId, targetElapsed) {
    await tracking.handover(productId, distributor, { from: farmer });
    await update(productId, 1, distributor);
    await update(productId, 2, distributor);

    const registeredAt = Number(await product.registeredAtOf(productId));
    const latest = await web3.eth.getBlock('latest');
    const elapsed = Number(latest.timestamp) - registeredAt;
    const waitSeconds = targetElapsed - elapsed;
    if (waitSeconds > 0) await rpc('evm_increaseTime', [waitSeconds]);
    await update(productId, 3, distributor);
    return Number(await tracking.actedAtOf(productId, 3)) - registeredAt;
  }

  async function sellProduct(productId, recordedBuyer = buyer) {
    await recordCare(productId);
    await update(productId, 4, retailer, 'Shop');
    await update(productId, 5, retailer, 'Shop');
    if (recordedBuyer) {
      await tracking.recordBuyer(productId, recordedBuyer, { from: retailer });
    }
  }

  async function recordCare(productId, flags = [true, true, true, true], explanation = 'Product remained in proper storage conditions.') {
    return tracking.handoverWithCare(
      productId,
      retailer,
      flags,
      explanation,
      { from: distributor }
    );
  }

  beforeEach(async () => {
    batchNumber = 0;
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

  it('registers roles, rejects unauthorized grants, and protects the admin role', async () => {
    const roles = await registry.getRoles(farmer);
    assert.equal(roles.farmer, true);
    assert.equal(roles.distributor, false);
    assert.equal(await registry.isAdmin(admin), true);
    await expectRevert(registry.grantRole(await registry.RETAILER_ROLE(), outsider, { from: outsider }));
    await expectRevert(registry.grantRole(web3.utils.keccak256('UNKNOWN'), outsider, { from: admin }));
    await expectRevert(registry.grantRole(await registry.FARMER_ROLE(), farmer, { from: admin }));
    await expectRevert(registry.grantRole(await registry.FARMER_ROLE(), '0x0000000000000000000000000000000000000000', { from: admin }));
    await registry.revokeRole(await registry.FARMER_ROLE(), farmer, { from: admin });
    await expectRevert(registry.revokeRole(await registry.FARMER_ROLE(), farmer, { from: admin }));
    await expectRevert(registry.revokeRole(await registry.ADMIN_ROLE(), admin, { from: admin }));
  });

  it('registers unique batches with the farmer as the initial custodian', async () => {
    const id = await registerProduct();
    const item = await product.getProduct(id);
    assert.equal(item.id.toString(), '1');
    assert.equal(item.name, 'Product 1');
    assert.equal(item.batchId, 'BATCH-1');
    assert.equal(item.farmer, farmer);
    assert.equal(item.custodian, farmer);
    assert.equal(item.deliveryWindow.toString(), '100');
    assert.equal(await product.exists(0), false);
    assert.equal(await product.exists(id), true);
    assert.equal((await product.getProductIdByBatch('BATCH-1')).toString(), '1');
    assert.deepEqual((await product.getFarmerProducts(farmer)).map(String), ['1']);
  });

  it('rejects unauthorized or invalid product registrations and unknown identifiers', async () => {
    const hash = web3.utils.keccak256('valid');
    await expectRevert(product.registerProduct('name', 'other', hash, 10, { from: outsider }));
    await expectRevert(product.registerProduct('', 'batch', hash, 10, { from: farmer }));
    await expectRevert(product.registerProduct('name', '', hash, 10, { from: farmer }));
    await expectRevert(product.registerProduct('name', 'batch', `0x${'0'.repeat(64)}`, 10, { from: farmer }));
    await expectRevert(product.registerProduct('name', 'batch', hash, 0, { from: farmer }));
    await product.registerProduct('name', 'batch', hash, 10, { from: farmer });
    await expectRevert(product.registerProduct('again', 'batch', hash, 10, { from: farmer }));
    await expectRevert(product.getProduct(0));
    await expectRevert(product.getProduct(2));
    await expectRevert(product.getProductIdByBatch('missing'));
    await expectRevert(product.farmerOf(0));
    await expectRevert(product.custodianOf(2));
    assert.equal((await product.productCount()).toString(), '1');
  });

  it('rejects product and tracking strings that exceed storage limits', async () => {
    const id = await registerProduct();
    const hash = web3.utils.keccak256('oversized');
    await expectRevert(product.registerProduct(
      'n'.repeat(121),
      'LONG-NAME',
      hash,
      10,
      { from: farmer }
    ));
    await expectRevert(product.registerProduct(
      'Product',
      'b'.repeat(65),
      hash,
      10,
      { from: farmer }
    ));
    await tracking.handover(id, distributor, { from: farmer });
    await expectRevert(tracking.updateShipment(
      id,
      1,
      'l'.repeat(121),
      '',
      hash,
      { from: distributor }
    ));
    await expectRevert(tracking.updateShipment(
      id,
      1,
      'Farm',
      'n'.repeat(501),
      hash,
      { from: distributor }
    ));
    await expectRevert(tracking.recall(
      id,
      'r'.repeat(501),
      { from: inspector }
    ));
  });

  it('sets the tracking contract only once and restricts custodian updates to tracking', async () => {
    await expectRevert(product.setTrackingContract(tracking.address, { from: outsider }));
    await expectRevert(product.setTrackingContract('0x0000000000000000000000000000000000000000', { from: admin }));
    await expectRevert(product.setTrackingContract(tracking.address, { from: admin }));
    const id = await registerProduct();
    await expectRevert(product.setCustodian(id, distributor, { from: farmer }));
    await tracking.handover(id, distributor, { from: farmer });
    assert.equal(await product.custodianOf(id), distributor);
  });

  it('enforces the complete custody and forward-only shipment lifecycle', async () => {
    const id = await registerProduct();
    await expectRevert(tracking.handover(id, retailer, { from: farmer }));
    await expectRevert(tracking.handover(id, distributor, { from: outsider }));
    await expectRevert(tracking.handover(id, farmer, { from: farmer }));
    await tracking.handover(id, distributor, { from: farmer });
    await expectRevert(update(id, 2, distributor));
    await expectRevert(update(id, 1, farmer));
    await expectRevert(update(id, 1, outsider, ''));
    await update(id, 1, distributor);
    await expectRevert(update(id, 1, distributor));
    await update(id, 2, distributor);
    await update(id, 3, distributor);
    await expectRevert(tracking.handover(id, retailer, { from: outsider }));
    await expectRevert(tracking.handover(id, outsider, { from: distributor }));
    await expectRevert(tracking.handover(id, retailer, { from: distributor }));
    await recordCare(id);
    const attestation = await tracking.getCareAttestation(id);
    assert.equal(attestation.distributor, distributor);
    assert.equal(attestation.retailer, retailer);
    assert.equal(await tracking.hasCareAttestation(id), true);
    assert.equal(await product.custodianOf(id), retailer);
    await expectRevert(update(id, 4, distributor));
    await update(id, 4, retailer);
    await update(id, 5, retailer);

    const history = await tracking.getHistory(id);
    assert.deepEqual(history.map((entry) => entry.status.toString()), ['0', '1', '2', '3', '4', '5']);
    assert.equal(history[0].updatedBy, farmer);
    assert.equal(history[1].updatedBy, distributor);
    assert.equal(history[4].updatedBy, retailer);
    assert.equal((await tracking.getUpdateCount(id)).toString(), '6');
    assert.equal((await tracking.getCurrentStatus(id)).toString(), '5');
    assert.equal(await tracking.actorOf(id, 1), distributor);
    assert.equal(await tracking.actorOf(id, 4), retailer);
    assert.equal(
      (await tracking.actedAtOf(id, 0)).toString(),
      (await product.registeredAtOf(id)).toString()
    );
  });

  it('rejects role-ineligible custodians, invalid handover stages, and unknown tracking views', async () => {
    const id = await registerProduct();
    await tracking.handover(id, distributor, { from: farmer });
    await registry.revokeRole(await registry.DISTRIBUTOR_ROLE(), distributor, { from: admin });
    await expectRevert(update(id, 1, distributor));
    await registry.grantRole(await registry.DISTRIBUTOR_ROLE(), distributor, { from: admin });
    await update(id, 1, distributor);
    await expectRevert(tracking.handover(id, retailer, { from: distributor }));
    await registry.revokeRole(await registry.RETAILER_ROLE(), retailer, { from: admin });
    await update(id, 2, distributor);
    await update(id, 3, distributor);
    await expectRevert(tracking.handover(id, retailer, { from: distributor }));
    await registry.grantRole(await registry.RETAILER_ROLE(), retailer, { from: admin });
    await recordCare(id);
    await registry.revokeRole(await registry.RETAILER_ROLE(), retailer, { from: admin });
    await expectRevert(update(id, 4, retailer));
    await registry.grantRole(await registry.RETAILER_ROLE(), retailer, { from: admin });
    await update(id, 4, retailer);
    await expectRevert(tracking.getUpdateCount(0));
    await expectRevert(tracking.actorOf(0, 0));
    await expectRevert(tracking.actedAtOf(99, 0));
    await expectRevert(tracking.isRecalled(99));
  });

  it('requires valid distributor care details and records an immutable handover attestation', async () => {
    const id = await registerProduct();
    await prepareDelivery(id, 20);
    await expectRevert(recordCare(id, [false, true, true, true], 'Damaged'));
    await expectRevert(recordCare(id, [true, true, true, true], ''));
    await expectRevert(recordCare(id, [true, true, true, true], '   '));
    await expectRevert(tracking.handoverWithCare(
      id, retailer, [true, true, true, true], 'Valid storage condition details.',
      { from: farmer }
    ));
    await registry.revokeRole(await registry.DISTRIBUTOR_ROLE(), distributor, { from: admin });
    await expectRevert(tracking.handoverWithCare(
      id, retailer, [true, true, true, true], 'Valid storage condition details.',
      { from: distributor }
    ));
    await registry.grantRole(await registry.DISTRIBUTOR_ROLE(), distributor, { from: admin });
    await expectRevert(tracking.handoverWithCare(
      id, retailer, [true, true, true, true], 'Valid storage condition details.',
      { from: outsider }
    ));

    const tx = await recordCare(id, [false, true, true, true], 'Temperature was above the safe range during storage.');
    const attestation = await tracking.getCareAttestation(id);
    assert.equal(attestation.temperatureMaintained, false);
    assert.equal(attestation.packagingIntact, true);
    assert.equal(attestation.explanation, 'Temperature was above the safe range during storage.');
    assert.notEqual(attestation.detailsHash, `0x${'0'.repeat(64)}`);
    assert.equal(await tracking.hasCareAttestation(id), true);
    assert.equal(await product.custodianOf(id), retailer);
    const emitted = tx.logs.find((log) => log.event === 'CareAttestationRecorded').args;
    assert.equal(emitted.productId.toString(), String(id));
    assert.equal(emitted.distributor, distributor);
    assert.equal(emitted.retailer, retailer);
    assert.equal(emitted.storedSince.toString(), attestation.storedSince.toString());
    assert.equal(emitted.handedOverAt.toString(), attestation.handedOverAt.toString());
    assert.equal(emitted.storageDays.toString(), attestation.storageDays.toString());
    assert.equal(emitted.storageSeconds.toString(), attestation.storageSeconds.toString());
    assert.equal(emitted.temperatureMaintained, false);
    assert.equal(emitted.explanation, attestation.explanation);
    assert.equal(emitted.detailsHash, attestation.detailsHash);
    await expectRevert(recordCare(id));
    console.log(`Care attestation transaction gas used: ${tx.receipt.gasUsed}`);
  });

  it('computes storage duration from Delivered and handover timestamps', async () => {
    for (const days of [0, 1, 3, 10]) {
      const id = await registerProduct();
      await prepareDelivery(id, 20);
      const storedSince = Number(await tracking.actedAtOf(id, 3));
      if (days > 0) await rpc('evm_increaseTime', [days * 86400]);
      await recordCare(id);

      const attestation = await tracking.getCareAttestation(id);
      const elapsed = Number(attestation.handedOverAt) - storedSince;
      assert.equal(Number(attestation.storedSince), storedSince);
      assert.equal(Number(attestation.storageSeconds), elapsed);
      assert.equal(Number(attestation.storageDays), Math.floor(elapsed / 86400));
      assert.equal(Number(attestation.storageDays), days);
    }
  });

  it('requires a sold product and its retailer to record a buyer exactly once', async () => {
    const id = await registerProduct();
    await expectRevert(tracking.recordBuyer(id, buyer, { from: retailer }));
    await expectRevert(tracking.buyerOf(id));
    await prepareDelivery(id, 20);
    await sellProduct(id, null);
    await expectRevert(tracking.recordBuyer(id, buyer, { from: distributor }));
    await tracking.recordBuyer(id, buyer, { from: retailer });
    assert.equal(await tracking.buyerOf(id), buyer);
    await expectRevert(tracking.recordBuyer(id, otherBuyer, { from: retailer }));
    await expectRevert(tracking.recordBuyer(id, retailer, { from: retailer }));
    await expectRevert(tracking.recordBuyer(id, '0x0000000000000000000000000000000000000000', { from: retailer }));
  });

  it('recalls products and blocks later updates and handovers', async () => {
    const id = await registerProduct();
    await expectRevert(tracking.recall(id, 'unsafe', { from: outsider }));
    await expectRevert(tracking.recall(id, '', { from: inspector }));
    await tracking.recall(id, 'Contamination found', { from: inspector });
    assert.equal(await tracking.isRecalled(id), true);
    assert.equal(await tracking.recallReasonOf(id), 'Contamination found');
    await expectRevert(tracking.recall(id, 'duplicate', { from: inspector }));
    await expectRevert(tracking.handover(id, distributor, { from: farmer }));
    await expectRevert(update(id, 1, farmer));
    await expectRevert(tracking.getCurrentStatus(99));
  });

  it('rejects buyer records and feedback for recalled products', async () => {
    const buyerProductId = await registerProduct();
    await prepareDelivery(buyerProductId, 20);
    await sellProduct(buyerProductId, null);
    await tracking.recall(buyerProductId, 'Safety issue', { from: inspector });
    await expectRevert(tracking.recordBuyer(buyerProductId, buyer, { from: retailer }));

    const feedbackProductId = await registerProduct();
    await prepareDelivery(feedbackProductId, 20);
    await sellProduct(feedbackProductId, buyer);
    await tracking.recall(feedbackProductId, 'Safety issue', { from: inspector });
    await expectRevert(
      reputation.submitFeedback(feedbackProductId, 0, 10000, { from: buyer })
    );
  });

  it('records an inspector inspection once and rejects invalid scores', async () => {
    const id = await registerProduct();
    await expectRevert(reputation.recordInspection(id, 9000, 9000, { from: outsider }));
    await expectRevert(reputation.recordInspection(id, 10001, 9000, { from: inspector }));
    await expectRevert(reputation.recordInspection(id, 9000, 10001, { from: inspector }));
    await reputation.recordInspection(id, 9000, 8000, { from: inspector });
    const result = await reputation.getInspection(id);
    assert.equal(result.quality.toString(), '9000');
    assert.equal(result.compliance.toString(), '8000');
    assert.equal(result.inspector, inspector);
    assert.equal(result.exists, true);
    await expectRevert(reputation.recordInspection(id, 7000, 7000, { from: inspector }));
    await expectRevert(reputation.recordInspection(99, 7000, 7000, { from: inspector }));
  });

  it('rejects self-inspection, recalled scoring, and delivery windows over one year', async () => {
    await expectRevert(registerProduct(10n ** 18n));
    const id = await registerProduct(365 * 24 * 60 * 60);
    assert.equal((await product.deliveryWindowOf(id)).toString(), '31536000');
    await registry.grantRole(await registry.INSPECTOR_ROLE(), farmer, { from: admin });
    await expectRevert(reputation.recordInspection(id, 10000, 10000, { from: farmer }));
    await reputation.recordInspection(id, 10000, 10000, { from: inspector });
    await tracking.recall(id, 'Unsafe product', { from: inspector });
    await expectRevert(reputation.finalizeScore(id, farmer, { from: inspector }));
    assert.equal((await reputation.getReputation(farmer)).exists, false);
  });

  it('accepts feedback only from the recorded buyer of a sold product', async () => {
    const id = await registerProduct();
    await expectRevert(reputation.submitFeedback(id, 5000, 7000, { from: buyer }));
    await prepareDelivery(id, 20);
    await sellProduct(id);
    await expectRevert(reputation.submitFeedback(id, 5000, 7000, { from: otherBuyer }));
    await expectRevert(reputation.submitFeedback(id, 10001, 7000, { from: buyer }));
    await reputation.submitFeedback(id, 5000, 7000, { from: buyer });
    const feedback = await reputation.getFeedback(id);
    assert.equal(feedback.complaint.toString(), '5000');
    assert.equal(feedback.satisfaction.toString(), '7000');
    assert.equal(feedback.buyer, buyer);
    assert.equal(feedback.exists, true);
    await expectRevert(reputation.submitFeedback(id, 0, 0, { from: buyer }));
  });

  it('stores feedback without inventing a reputation score', async () => {
    const id = await registerProduct();
    await prepareDelivery(id, 20);
    await sellProduct(id);
    await reputation.submitFeedback(id, 0, 9000, { from: buyer });
    const score = await reputation.getReputation(farmer);
    assert.equal(score.exists, false);
    assert.equal(score.batches.toString(), '0');
    assert.equal((await reputation.getHistory(farmer)).length, 0);
  });

  it('waits for buyer feedback or the post-sale feedback window before finalizing', async () => {
    const id = await registerProduct(1000);
    await prepareDelivery(id, 20);
    await sellProduct(id);
    await reputation.recordInspection(id, 10000, 10000, { from: inspector });
    await expectRevert(reputation.finalizeScore(id, farmer, { from: inspector }));
    await reputation.submitFeedback(id, 9000, 1000, { from: buyer });
    const finalized = await reputation.finalizeScore(id, farmer, { from: inspector });
    const score = await reputation.getReputation(farmer);
    assert.equal(finalized.logs.find((log) => log.event === 'ReputationFinalized').args.batchScore.toString(), '7300');
    assert.equal(score.scoreBps.toString(), '7300');
  });

  it('allows finalization after 14 days without feedback and rejects late feedback', async () => {
    const id = await registerProduct(1000);
    await prepareDelivery(id, 20);
    await sellProduct(id);
    await reputation.recordInspection(id, 10000, 10000, { from: inspector });
    const soldAt = Number(await tracking.actedAtOf(id, 5));
    await rpc('evm_increaseTime', [14 * 86400 + 1]);
    await rpc('evm_mine');
    await reputation.finalizeScore(id, farmer, { from: inspector });
    const finalizedAt = Number((await web3.eth.getBlock('latest')).timestamp);
    assert(finalizedAt > soldAt + 14 * 86400);
    await expectRevert(reputation.submitFeedback(id, 9000, 1000, { from: buyer }));
  });

  it('scores worse feedback lower while preserving raw complaint values', async () => {
    const scores = [];
    for (const [complaint, satisfaction] of [[0, 10000], [9000, 1000]]) {
      const id = await registerProduct(1000);
      await prepareDelivery(id, 20);
      await sellProduct(id);
      await reputation.recordInspection(id, 10000, 10000, { from: inspector });
      await reputation.submitFeedback(id, complaint, satisfaction, { from: buyer });
      const result = await reputation.finalizeScore(id, farmer, { from: inspector });
      const finalized = result.logs.find((log) => log.event === 'ReputationFinalized');
      scores.push(Number(finalized.args.batchScore));
    }
    assert.deepEqual(scores, [10000, 7300]);
    const feedback = await reputation.getFeedback(2);
    assert.equal(feedback.complaint.toString(), '9000');
  });

  it('requires an inspection and participant status before one-time finalization', async () => {
    const id = await registerProduct();
    await expectRevert(reputation.finalizeScore(id, farmer, { from: inspector }));
    await reputation.recordInspection(id, 8000, 6000, { from: inspector });
    await expectRevert(reputation.finalizeScore(id, outsider, { from: inspector }));
    await expectRevert(reputation.finalizeScore(id, farmer, { from: outsider }));
    await expectRevert(reputation.finalizeScore(id, farmer, { from: inspector }));
    await prepareDelivery(id, 20);
    await sellProduct(id);
    await reputation.submitFeedback(id, 0, 9000, { from: buyer });
    await reputation.finalizeScore(id, farmer, { from: inspector });
    await expectRevert(reputation.finalizeScore(id, farmer, { from: inspector }));
    assert.equal((await reputation.getHistory(farmer)).length, 1);
    assert.equal(await reputation.getTrustLevel(farmer), 'Unrated');
    assert.equal(await reputation.getTrustLevel(outsider), 'Unrated');
  });

  it('withholds stakeholder trust labels until three finalized batches', async () => {
    for (let index = 1; index <= 3; index++) {
      const id = await registerProduct(1000);
      await prepareDelivery(id, 20);
      await sellProduct(id);
      await reputation.recordInspection(id, 10000, 10000, { from: inspector });
      await reputation.submitFeedback(id, 0, 10000, { from: buyer });
      await reputation.finalizeScore(id, farmer, { from: inspector });
      assert.equal(
        await reputation.getTrustLevel(farmer),
        index === 3 ? 'Excellent' : 'Unrated'
      );
    }
    assert.equal((await reputation.getReputation(farmer)).batches.toString(), '3');
  });

  it('finalizes one inspection for each actual journey participant', async () => {
    const id = await registerProduct();
    await prepareDelivery(id, 20);
    await sellProduct(id);
    await reputation.recordInspection(id, 8000, 6000, { from: inspector });
    await reputation.submitFeedback(id, 0, 9000, { from: buyer });
    for (const stakeholder of [farmer, distributor, retailer]) {
      assert.equal(await reputation.isParticipant(id, stakeholder), true);
      await reputation.finalizeScore(id, stakeholder, { from: inspector });
      assert.equal((await reputation.getReputation(stakeholder)).batches.toString(), '1');
    }
  });

  it('accumulates batches with the configured EMA instead of overwriting', async () => {
    const first = await registerProduct();
    await reputation.recordInspection(first, 10000, 10000, { from: inspector });
    await prepareDelivery(first, 20);
    await sellProduct(first);
    await reputation.submitFeedback(first, 0, 10000, { from: buyer });
    await reputation.finalizeScore(first, farmer, { from: inspector });
    const firstScore = await reputation.getReputation(farmer);
    assert.equal(firstScore.scoreBps.toString(), '10000');

    const second = await registerProduct();
    await reputation.recordInspection(second, 4000, 4000, { from: inspector });
    await prepareDelivery(second, 20);
    await sellProduct(second);
    await reputation.submitFeedback(second, 10000, 0, { from: buyer });
    await reputation.finalizeScore(second, farmer, { from: inspector });
    const secondScore = await reputation.getReputation(farmer);
    assert.equal(secondScore.scoreBps.toString(), '8290');
    assert.equal(secondScore.batches.toString(), '2');
    const history = await reputation.getHistory(farmer);
    assert.equal(history.length, 2);
    assert.equal(history[1].scoreBps.toString(), '8290');
  });

  it('computes delivery scores at 0.5x, 1.5x and 2.5x the delivery window', async () => {
    for (const targetElapsed of [50, 150, 250]) {
      const id = await registerProduct(100);
      const elapsed = await prepareDelivery(id, targetElapsed);
      const score = await reputation.deliveryScoreOf(id);
      assert(
        Math.abs(elapsed - targetElapsed) <= 1,
        `expected ${targetElapsed}s elapsed, received ${elapsed}s`
      );
      const expectedScore = elapsed <= 100
        ? 10000
        : elapsed >= 200
          ? 0
          : 10000 - Math.floor(((elapsed - 100) * 10000) / 100);
      assert.equal(score.toString(), expectedScore.toString());
    }
  });

  it('matches an independent delivery formula at boundaries and deterministic random inputs', async () => {
    const cases = [
      [0, 100],
      [50, 100],
      [100, 100],
      [101, 100],
      [150, 100],
      [199, 100],
      [200, 100],
      [250, 100]
    ];
    let seed = 7341;
    for (let index = 0; index < 40; index += 1) {
      seed = (seed * 48271) % 2147483647;
      const window = (seed % 100000) + 1;
      seed = (seed * 48271) % 2147483647;
      const elapsed = seed % (window * 3 + 1);
      cases.push([elapsed, window]);
    }

    for (const [elapsed, window] of cases) {
      const expected = elapsed <= window
        ? 10000
        : elapsed >= window * 2
          ? 0
          : 10000 - Math.floor(((elapsed - window) * 10000) / window);
      const actual = await reputation.calculateDeliveryScore(elapsed, window);
      assert.equal(actual.toString(), expected.toString(), `${elapsed}/${window}`);
    }
    await expectRevert(reputation.calculateDeliveryScore(1, 0));
  });

  it('uses only available weighted components and validates admin configuration', async () => {
    const defaultWeights = await reputation.weights();
    assert.deepEqual(defaultWeights.map((value) => Number(value)), [3000, 2500, 2000, 1500, 1000]);
    assert.equal((await reputation.alpha()).toString(), '3000');
    assert.deepEqual((await reputation.thresholds()).map((value) => Number(value)), [2000, 4000, 6000, 8000]);
    assert.equal(
      (await reputation.combine(
        [10000, 0, 0, 5000, 0],
        [3000, 2500, 2000, 1500, 1000],
        [true, false, false, true, false]
      )).toString(),
      '8333'
    );

    await expectRevert(reputation.setWeights(3000, 2500, 2000, 1500, 999, { from: admin }));
    await expectRevert(reputation.setWeights(10001, 0, 0, 0, 0, { from: admin }));
    await expectRevert(reputation.setWeights(0, 5000, 3000, 0, 2000, { from: admin }));
    await expectRevert(reputation.setWeights(3000, 2500, 2000, 1500, 1000, { from: outsider }));
    await reputation.setWeights(4000, 2000, 1500, 1500, 1000, { from: admin });
    await expectRevert(reputation.setAlpha(0, { from: admin }));
    await expectRevert(reputation.setAlpha(10001, { from: admin }));
    await reputation.setAlpha(5000, { from: admin });
    await expectRevert(reputation.setThresholds(4000, 3000, 6000, 8000, { from: admin }));
    await expectRevert(reputation.setThresholds(1000, 3000, 6000, 10001, { from: admin }));
    await expectRevert(reputation.setThresholds(1000, 3000, 6000, 8000, { from: outsider }));
    await reputation.setThresholds(1000, 3000, 6000, 9000, { from: admin });
    assert.equal(await reputation.trustLevelForScore(9000), 'Excellent');
    await expectRevert(reputation.trustLevelForScore(10001));
    await expectRevert(
      reputation.combine([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [false, false, false, false, false])
    );
  });
});
