import React from 'react';

const checks = [
  ['Temperature maintained', 'temperatureMaintained'],
  ['Packaging intact', 'packagingIntact'],
  ['Hygiene maintained', 'hygieneMaintained'],
  ['No damage or spoilage', 'noDamageOrSpoilage']
];

function StorageCareAttestation({ care }) {
  if (!care) return null;

  const formatDate = (value) => new Date(value).toLocaleString();

  return (
    <section aria-labelledby="storage-care-heading" className="public-section">
      <h4 id="storage-care-heading">Storage and handling</h4>
      <p><strong>Stored for:</strong> {care.storageDays} days</p>
      <p><strong>Storage began:</strong> {formatDate(care.storedSince)}</p>
      <p><strong>Handed over:</strong> {formatDate(care.handedOverAt)}</p>
      <p><strong>Distributor wallet:</strong> <code>{care.distributor}</code></p>
      <ul>
        {checks.map(([label, field]) => (
          <li
            key={field}
            data-testid={care[field] ? undefined : 'care-failed'}
            style={{
              color: care[field] ? 'inherit' : '#b42318',
              fontWeight: care[field] ? 'normal' : 'bold'
            }}
          >
            {label}: {care[field] ? 'Yes' : 'No — issue reported'}
          </li>
        ))}
      </ul>
      <p><strong>Distributor explanation:</strong> {care.explanation}</p>
    </section>
  );
}

export default StorageCareAttestation;
