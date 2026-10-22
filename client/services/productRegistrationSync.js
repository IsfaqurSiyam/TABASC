const assertProductRegistrationTarget = (existingProduct, pending) => {
  if (!existingProduct) return;

  const expectedBatchId = pending.payload?.product?.batchId;
  if (existingProduct.batchId !== expectedBatchId ||
      existingProduct.transactionHash !== pending.txHash) {
    throw new Error(
      `Blockchain product ${pending.blockchainId} already belongs to a different MongoDB record; refusing to overwrite it`
    );
  }
};

const archiveDisplacedProduct = async ({
  existingProduct,
  pending,
  chainId,
  contractAddress,
  reason = 'A new chain deployment reused this product ID',
  models
}) => {
  if (!existingProduct ||
      (pending &&
       existingProduct.batchId === pending.payload.product.batchId &&
       existingProduct.transactionHash === pending.txHash)) {
    return false;
  }

  const batches = await models.Batch.find({ products: existingProduct._id }).lean();
  const batchesToRemove = batches.filter((batch) => (
    batch.products.length === 1 &&
    String(batch.products[0]) === String(existingProduct._id)
  ));
  const batchIdsToRemove = batchesToRemove.map((batch) => batch._id);
  const eventFilter = pending
    ? { product: existingProduct._id, txHash: { $ne: pending.txHash } }
    : { product: existingProduct._id };
  const [trackingEvents, consumerReviews] = await Promise.all([
    models.TrackingEvent.find(eventFilter).lean(),
    batchIdsToRemove.length
      ? models.ConsumerReview.find({ batch: { $in: batchIdsToRemove } }).lean()
      : []
  ]);

  await models.ArchivedProduct.updateOne(
    { sourceProductId: String(existingProduct._id) },
    {
      $setOnInsert: {
        sourceProductId: String(existingProduct._id),
        sourceBlockchainId: existingProduct.blockchainId,
        sourceTransactionHash: existingProduct.transactionHash,
        displacedByTransactionHash: pending?.txHash || null,
        chainIdAtArchival: String(chainId),
        configuredContractAddress: contractAddress,
        reason,
        productSnapshot: existingProduct,
        batchSnapshots: batches,
        trackingEventSnapshots: trackingEvents,
        consumerReviewSnapshots: consumerReviews
      }
    },
    { upsert: true }
  );

  await models.TrackingEvent.deleteMany(eventFilter);
  if (batchIdsToRemove.length) {
    await models.ConsumerReview.deleteMany({ batch: { $in: batchIdsToRemove } });
    await models.Batch.deleteMany({ _id: { $in: batchIdsToRemove } });
  }
  for (const batch of batches.filter((entry) => !batchesToRemove.includes(entry))) {
    const remainingProducts = batch.products.filter(
      (productId) => String(productId) !== String(existingProduct._id)
    );
    await models.Batch.updateOne(
      { _id: batch._id },
      { $pull: { products: existingProduct._id }, $set: { totalProducts: remainingProducts.length } }
    );
  }

  const result = await models.Product.deleteOne({
    _id: existingProduct._id,
    blockchainId: existingProduct.blockchainId,
    transactionHash: existingProduct.transactionHash
  });
  if (result.deletedCount !== 1) {
    throw new Error(`Conflicting MongoDB product ${existingProduct._id} changed during archival`);
  }
  return true;
};

module.exports = { archiveDisplacedProduct, assertProductRegistrationTarget };
