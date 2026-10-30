import React from 'react';
import { render, screen, within } from '@testing-library/react';
import StorageCareAttestation from './StorageCareAttestation';

test('renders failed care checklist items clearly with the attestation details', () => {
  render(
    <StorageCareAttestation
      care={{
        distributor: '0xdistributor',
        storedSince: '2026-10-22T10:08:33.000Z',
        handedOverAt: '2026-10-25T10:08:33.000Z',
        storageDays: 3,
        temperatureMaintained: true,
        packagingIntact: false,
        hygieneMaintained: true,
        noDamageOrSpoilage: true,
        explanation: 'Packaging was compromised during storage.'
      }}
    />
  );

  const section = screen.getByRole('region', { name: 'Storage and handling' });
  expect(section).toHaveTextContent('Stored for: 3 days');
  expect(screen.getByText('0xdistributor')).toBeInTheDocument();
  const failedItem = screen.getByTestId('care-failed');
  expect(within(failedItem).getByText(/Packaging intact: No — issue reported/)).toBeInTheDocument();
  expect(failedItem).toHaveStyle({ color: 'rgb(180, 35, 24)' });
  expect(screen.getByText('Packaging was compromised during storage.')).toBeInTheDocument();
});
