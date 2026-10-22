import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import SupplyChainActions from './SupplyChainActions';
import { API_URL } from '../../config/api';

vi.mock('axios');

const product = {
  _id: 'product-id',
  name: 'Tomatoes',
  batchId: 'BATCH-1',
  currentStatus: 'Harvested',
  isRecalled: false,
  buyer: null
};

beforeEach(() => {
  vi.clearAllMocks();
  axios.post.mockResolvedValue({ data: { message: 'Action completed' } });
});

test('farmers can transfer harvested product custody to an approved distributor', async () => {
  const onComplete = vi.fn();
  render(<SupplyChainActions products={[product]} role="farmer" onComplete={onComplete} />);
  fireEvent.change(screen.getByLabelText('Product'), { target: { value: product._id } });
  fireEvent.change(screen.getByLabelText('Approved recipient email'), {
    target: { value: 'distributor@example.test' }
  });
  fireEvent.click(screen.getByRole('button', { name: /transfer custody/i }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    `${API_URL}/products/${product._id}/handover`,
    { email: 'distributor@example.test' }
  ));
  expect(onComplete).toHaveBeenCalled();
});

test('retailers can record an active consumer after sale', async () => {
  const soldProduct = { ...product, currentStatus: 'Sold' };
  render(<SupplyChainActions products={[soldProduct]} role="retailer" onComplete={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Product'), { target: { value: soldProduct._id } });
  fireEvent.change(screen.getByLabelText('Consumer email'), {
    target: { value: 'consumer@example.test' }
  });
  fireEvent.click(screen.getByRole('button', { name: /record buyer/i }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    `${API_URL}/tracking/${soldProduct._id}/buyer`,
    { email: 'consumer@example.test' }
  ));
});

test('inspectors can issue a recall with its reason', async () => {
  render(<SupplyChainActions products={[product]} role="inspector" onComplete={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Product'), { target: { value: product._id } });
  fireEvent.change(screen.getByLabelText('Recall reason'), {
    target: { value: 'Contamination detected' }
  });
  fireEvent.click(screen.getByRole('button', { name: /issue recall/i }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    `${API_URL}/tracking/${product._id}/recall`,
    { reason: 'Contamination detected' }
  ));
});

test('distributor care handover requires a valid explanation and submits the checklist', async () => {
  const deliveredProduct = { ...product, currentStatus: 'Delivered' };
  axios.get.mockResolvedValue({
    data: { storedSince: '2026-10-22T10:08:33.000Z', storageDays: 3 }
  });
  render(<SupplyChainActions products={[deliveredProduct]} role="distributor" onComplete={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Product'), {
    target: { value: deliveredProduct._id }
  });
  expect(await screen.findByText(/Stored for 3 days/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Approved recipient email'), {
    target: { value: 'retailer@example.test' }
  });
  fireEvent.change(screen.getByLabelText('Storage conditions and explanation'), {
    target: { value: 'Short' }
  });
  const submit = screen.getByRole('button', { name: /transfer custody/i });
  expect(submit).toBeDisabled();

  for (const label of [
    'Temperature maintained',
    'Packaging intact',
    'Hygiene maintained',
    'No damage or spoilage'
  ]) {
    fireEvent.click(screen.getByLabelText(label));
  }
  expect(submit).toBeEnabled();
  fireEvent.click(screen.getByLabelText('Temperature maintained'));
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Storage conditions and explanation'), {
    target: { value: 'Temperature exceeded the safe range during storage.' }
  });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    `${API_URL}/products/${deliveredProduct._id}/handover`,
    {
      email: 'retailer@example.test',
      care: {
        temperatureMaintained: false,
        packagingIntact: true,
        hygieneMaintained: true,
        noDamageOrSpoilage: true
      },
      explanation: 'Temperature exceeded the safe range during storage.'
    }
  ));
});

test('shows backend errors when a distributor care handover is rejected', async () => {
  const deliveredProduct = { ...product, currentStatus: 'Delivered' };
  axios.get.mockResolvedValue({
    data: { storedSince: '2026-10-22T10:08:33.000Z', storageDays: 0 }
  });
  axios.post.mockRejectedValue({
    response: { data: { message: 'Recipient is not an active retailer' } }
  });
  render(<SupplyChainActions products={[deliveredProduct]} role="distributor" onComplete={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Product'), {
    target: { value: deliveredProduct._id }
  });
  await screen.findByText(/Stored for 0 days/);
  fireEvent.change(screen.getByLabelText('Approved recipient email'), {
    target: { value: 'retailer@example.test' }
  });
  for (const label of [
    'Temperature maintained',
    'Packaging intact',
    'Hygiene maintained',
    'No damage or spoilage'
  ]) {
    fireEvent.click(screen.getByLabelText(label));
  }
  fireEvent.change(screen.getByLabelText('Storage conditions and explanation'), {
    target: { value: 'All conditions were maintained throughout storage.' }
  });
  fireEvent.click(screen.getByRole('button', { name: /transfer custody/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Recipient is not an active retailer');
});
