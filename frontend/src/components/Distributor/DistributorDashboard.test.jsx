import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import DistributorDashboard from './DistributorDashboard';
import { API_URL } from '../../config/api';

vi.mock('axios');
vi.mock('../Common/ReputationQRCode', () => ({ default: () => null }));
vi.mock('../Common/SupplyChainActions', () => ({ default: () => null }));

const pageOne = Array.from({ length: 25 }, (_, index) => ({
  _id: `product-${index + 1}`,
  name: `Product ${index + 1}`,
  batchId: `BATCH-${index + 1}`,
  currentStatus: 'Harvested',
  farmer: { name: 'Farmer' }
}));
const pageTwo = [{
  _id: 'product-26',
  name: 'Product 26',
  batchId: 'BATCH-26',
  currentStatus: 'Delivered',
  farmer: { name: 'Farmer' }
}];

beforeEach(() => {
  vi.clearAllMocks();
  axios.get.mockImplementation((url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    return Promise.resolve({
      data: page === 1 ? pageOne : pageTwo,
      headers: { 'x-total-count': '26' }
    });
  });
});

test('displays all products across pages and reports the server total', async () => {
  render(<DistributorDashboard />);

  expect(await screen.findByText('Showing 1–25 of 26 products')).toBeInTheDocument();
  let table = screen.getByRole('table');
  expect(within(table).getByText('BATCH-1')).toBeInTheDocument();
  expect(within(table).queryByText('BATCH-26')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    `${API_URL}/products?page=2&limit=25`
  ));
  expect(await screen.findByText('Showing 26–26 of 26 products')).toBeInTheDocument();
  table = screen.getByRole('table');
  expect(within(table).getByText('BATCH-26')).toBeInTheDocument();
});
