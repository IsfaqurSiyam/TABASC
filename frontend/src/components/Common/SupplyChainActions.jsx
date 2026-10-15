import React, { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../config/api';

function SupplyChainActions({ products, role, onComplete }) {
  const [productId, setProductId] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const action = role === 'inspector'
    ? 'recall'
    : role === 'retailer'
      ? 'buyer'
      : 'handover';
  const eligibleProducts = products.filter((product) => {
    if (action === 'recall') return !product.isRecalled;
    if (action === 'buyer') return product.currentStatus === 'Sold' && !product.buyer;
    return (role === 'farmer' && product.currentStatus === 'Harvested') ||
      (role === 'distributor' && product.currentStatus === 'Delivered');
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const product = products.find((entry) => entry._id === productId);
      if (!product) throw new Error('Select an eligible product');
      let response;
      if (action === 'recall') {
        response = await axios.post(
          `${API_URL}/tracking/${product._id}/recall`,
          { reason }
        );
      } else if (action === 'buyer') {
        response = await axios.post(
          `${API_URL}/tracking/${product._id}/buyer`,
          { email }
        );
      } else {
        response = await axios.post(
          `${API_URL}/products/${product._id}/handover`,
          { email }
        );
      }
      setMessage(response.data.message || 'Action completed');
      setEmail('');
      setReason('');
      setProductId('');
      await onComplete();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    recall: 'Recall a product',
    buyer: 'Record the consumer',
    handover: 'Transfer product custody'
  };
  const descriptions = {
    recall: 'Only products not already recalled can be selected.',
    buyer: 'Record the consumer after the product is marked Sold.',
    handover: role === 'farmer'
      ? 'Transfer a Harvested product to an approved distributor.'
      : 'Transfer a Delivered product to an approved retailer.'
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3>{titles[action]}</h3>
      <p>{descriptions[action]}</p>
      {message && <p role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <label htmlFor={`${action}-product`}>Product</label>
      <select
        id={`${action}-product`}
        value={productId}
        onChange={(event) => setProductId(event.target.value)}
        required
      >
        <option value="">Choose a product</option>
        {eligibleProducts.map((product) => (
          <option key={product._id} value={product._id}>
            {product.name} ({product.batchId}) — {product.currentStatus}
          </option>
        ))}
      </select>
      {action !== 'recall' && (
        <>
          <label htmlFor={`${action}-email`}>
            {action === 'buyer' ? 'Consumer email' : 'Approved recipient email'}
          </label>
          <input
            id={`${action}-email`}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </>
      )}
      {action === 'recall' && (
        <>
          <label htmlFor="recall-reason">Recall reason</label>
          <textarea
            id="recall-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            minLength={1}
            rows={3}
          />
        </>
      )}
      <button type="submit" disabled={loading || eligibleProducts.length === 0}>
        {loading ? 'Submitting...' : action === 'recall'
          ? 'Issue recall'
          : action === 'buyer' ? 'Record buyer' : 'Transfer custody'}
      </button>
      {eligibleProducts.length === 0 && (
        <p className="empty-state">No eligible products are currently available for this action.</p>
      )}
    </form>
  );
}

export default SupplyChainActions;
