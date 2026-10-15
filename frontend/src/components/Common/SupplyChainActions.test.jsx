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
