import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProductPagination from './ProductPagination';

test('shows the total number of products and changes pages', () => {
  const onPageChange = vi.fn();
  render(
    <ProductPagination
      page={2}
      pageSize={25}
      total={61}
      onPageChange={onPageChange}
    />
  );

  expect(screen.getByRole('status')).toHaveTextContent('Showing 26–50 of 61 products');
  expect(screen.getByLabelText('Current page')).toHaveTextContent('Page 2 of 3');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(onPageChange).toHaveBeenCalledWith(3);
});

test('handles an empty product list without showing an invalid range', () => {
  render(<ProductPagination page={1} pageSize={25} total={0} onPageChange={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('Showing 0–0 of 0 products');
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});
