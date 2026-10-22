const getTupleValue = (entry, field, index) =>
  entry[field] === undefined ? entry[index] : entry[field];

const timestampToIso = (seconds) => new Date(Number(seconds) * 1000).toISOString();

const formatCareAttestation = (entry) => ({
  distributor: getTupleValue(entry, 'distributor', 0),
  retailer: getTupleValue(entry, 'retailer', 1),
  storedSince: timestampToIso(getTupleValue(entry, 'storedSince', 2)),
  handedOverAt: timestampToIso(getTupleValue(entry, 'handedOverAt', 3)),
  storageDays: Number(getTupleValue(entry, 'storageDays', 4)),
  storageSeconds: Number(getTupleValue(entry, 'storageSeconds', 5)),
  temperatureMaintained: getTupleValue(entry, 'temperatureMaintained', 6),
  packagingIntact: getTupleValue(entry, 'packagingIntact', 7),
  hygieneMaintained: getTupleValue(entry, 'hygieneMaintained', 8),
  noDamageOrSpoilage: getTupleValue(entry, 'noDamageOrSpoilage', 9),
  explanation: getTupleValue(entry, 'explanation', 10),
  detailsHash: getTupleValue(entry, 'detailsHash', 11)
});

const readCareAttestation = async (trackingContract, blockchainId) => {
  const hasAttestation = await trackingContract.methods
    .hasCareAttestation(blockchainId)
    .call();
  if (!hasAttestation) return null;
  const entry = await trackingContract.methods.getCareAttestation(blockchainId).call();
  return formatCareAttestation(entry);
};

module.exports = { formatCareAttestation, readCareAttestation };
