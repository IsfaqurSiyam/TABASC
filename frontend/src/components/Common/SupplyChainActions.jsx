import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../config/api';

function SupplyChainActions({ products, role, onComplete }) {
  const [productId, setProductId] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [care, setCare] = useState({
    temperatureMaintained: false,
    packagingIntact: false,
    hygieneMaintained: false,
    noDamageOrSpoilage: false
  });
  const [explanation, setExplanation] = useState('');
  const [carePreview, setCarePreview] = useState(null);
  const [carePreviewError, setCarePreviewError] = useState('');
  const [carePreviewLoading, setCarePreviewLoading] = useState(false);
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
  const selectedProduct = products.find((product) => product._id === productId);
  const requiresCare = action === 'handover' && role === 'distributor';
  const hasFailedCheck = Object.values(care).some((value) => !value);
  const explanationBytes = new TextEncoder().encode(explanation.trim()).length;
  const careIsValid = explanationBytes > 0 &&
    explanationBytes <= 500 &&
    (!hasFailedCheck || explanationBytes >= 20);

  useEffect(() => {
    let active = true;
    setCarePreview(null);
    setCarePreviewError('');
    if (!requiresCare || !selectedProduct) {
      setCarePreviewLoading(false);
      return () => { active = false; };
    }
    setCarePreviewLoading(true);
    axios.get(`${API_URL}/products/${selectedProduct._id}/care-preview`)
      .then((response) => {
        if (active) setCarePreview(response.data);
      })
      .catch((requestError) => {
        if (active) {
          setCarePreviewError(
            requestError.response?.data?.message || requestError.message || 'Unable to load storage time'
          );
        }
      })
      .finally(() => {
        if (active) setCarePreviewLoading(false);
      });
    return () => { active = false; };
  }, [requiresCare, selectedProduct?._id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const product = selectedProduct;
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
        const body = { email };
        if (requiresCare) {
          body.care = care;
          body.explanation = explanation.trim();
        }
        response = await axios.post(
          `${API_URL}/products/${product._id}/handover`,
          body
        );
      }
      setMessage(response.data.message || 'Action completed');
      setEmail('');
      setReason('');
      setExplanation('');
      setCare({
        temperatureMaintained: false,
        packagingIntact: false,
        hygieneMaintained: false,
        noDamageOrSpoilage: false
      });
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
        onChange={(event) => {
          setProductId(event.target.value);
          setExplanation('');
          setCare({
            temperatureMaintained: false,
            packagingIntact: false,
            hygieneMaintained: false,
            noDamageOrSpoilage: false
          });
        }}
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
      {requiresCare && (
        <fieldset>
          <legend>Storage care checklist</legend>
          {carePreviewLoading && <p role="status">Loading storage time...</p>}
          {carePreviewError && <p className="error-message" role="alert">{carePreviewError}</p>}
          {carePreview && (
            <p>
              Stored for {carePreview.storageDays} days (since {new Date(carePreview.storedSince).toLocaleString()})
            </p>
          )}
          {[
            ['temperatureMaintained', 'Temperature maintained'],
            ['packagingIntact', 'Packaging intact'],
            ['hygieneMaintained', 'Hygiene maintained'],
            ['noDamageOrSpoilage', 'No damage or spoilage']
          ].map(([field, label]) => (
            <label key={field} style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={care[field]}
                onChange={(event) => setCare((current) => ({
                  ...current,
                  [field]: event.target.checked
                }))}
              />
              {label}
            </label>
          ))}
          <label htmlFor="care-explanation">Storage conditions and explanation</label>
          <textarea
            id="care-explanation"
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            required
            maxLength={500}
            rows={3}
          />
          {hasFailedCheck && explanationBytes > 0 && explanationBytes < 20 && (
            <p role="alert">Explain failed checklist items in at least 20 UTF-8 bytes.</p>
          )}
        </fieldset>
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
            maxLength={500}
            rows={3}
          />
        </>
      )}
      <button
        type="submit"
        disabled={loading || eligibleProducts.length === 0 ||
          (requiresCare && (!carePreview || carePreviewLoading || !careIsValid))}
      >
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
