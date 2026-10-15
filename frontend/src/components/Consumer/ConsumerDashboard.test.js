import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import ConsumerDashboard from './ConsumerDashboard';

jest.mock('axios');
jest.mock('../Common/ReputationScanner', () => () => null);

const product = {
  _id: 'mongo-product-id',
  blockchainId: 17,
  batchId: 'BATCH-17',
  name: 'Tomatoes',
  category: 'vegetables',
  currentStatus: 'Sold',
  farmer: { name: 'Farmer', location: 'Farm' }
};

const searchForBatch = async (eligibility = { canSubmit: true, reason: null }) => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/products/batch/BATCH-17')) {
      return Promise.resolve({ data: product });
    }
    if (url.endsWith('/tracking/17')) {
      return Promise.resolve({ data: { history: [] } });
    }
    if (url.endsWith('/reputation/feedback/BATCH-17')) {
      return Promise.resolve({ data: eligibility });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(
    <MemoryRouter>
      <ConsumerDashboard />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText(/enter batch id/i), {
    target: { value: product.batchId }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  if (eligibility.canSubmit) {
    await screen.findByRole('button', { name: 'Submit Feedback' });
  } else {
    await screen.findByText(eligibility.reason);
  }
};

beforeEach(() => jest.clearAllMocks());

test('shows feedback submission only when the consumer is eligible', async () => {
  await searchForBatch();
  expect(screen.getByRole('button', { name: 'Submit Feedback' })).toBeEnabled();
  expect(axios.get).toHaveBeenCalledWith(
    `${process.env.REACT_APP_API_URL}/reputation/feedback/BATCH-17`
  );
});

test('explains ineligibility without offering a feedback transaction', async () => {
  await searchForBatch({
    canSubmit: false,
    reason: 'Only the consumer recorded as this product’s buyer can submit feedback.'
  });
  expect(screen.getByText(
    'Only the consumer recorded as this product’s buyer can submit feedback.'
  )).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Submit Feedback' })).not.toBeInTheDocument();
});

test('shows the actual feedback transaction result without inventing a score', async () => {
  await searchForBatch();
  axios.post.mockResolvedValue({
    status: 201,
    data: {
      message: 'Product feedback recorded on-chain',
      txHash: '0xfeedback'
    }
  });

  fireEvent.click(screen.getByRole('button', { name: 'Submit Feedback' }));

  expect(await screen.findByText(
    'Product feedback recorded on-chain. Transaction: 0xfeedback'
  )).toBeInTheDocument();
  expect(screen.queryByText(/Farmer score:/i)).not.toBeInTheDocument();
});

test('reports pending synchronization instead of a completed database write', async () => {
  await searchForBatch();
  axios.post.mockResolvedValue({
    status: 202,
    data: {
      message: 'Blockchain transaction succeeded; MongoDB synchronization is pending',
      txHash: '0xpending'
    }
  });

  fireEvent.click(screen.getByRole('button', { name: 'Submit Feedback' }));

  await waitFor(() => expect(screen.getByText(
    /MongoDB synchronization is pending Transaction: 0xpending/
  )).toBeInTheDocument());
});
