import React from 'react';

function ProductPagination({ page, pageSize, total, onPageChange }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav aria-label="Product list pagination">
      <p role="status">Showing {start}–{end} of {total} products</p>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </button>
      <span aria-label="Current page"> Page {page} of {pageCount} </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
      >
        Next
      </button>
    </nav>
  );
}

export default ProductPagination;
