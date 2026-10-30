import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config/api';
import StorageCareAttestation from '../components/Common/StorageCareAttestation';

function ProductScan() {
  const { batchId } = useParams();
  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [reputation, setReputation] = useState(null);
  const [careAttestation, setCareAttestation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(
          `${API_URL}/products/batch/${encodeURIComponent(batchId)}`
        );
        setProduct(res.data);

        const trackRes = await axios.get(`${API_URL}/tracking/${res.data.blockchainId}`);
        setHistory(trackRes.data.history);
        try {
          const careRes = await axios.get(
            `${API_URL}/tracking/${res.data.blockchainId}/care`
          );
          setCareAttestation(careRes.data.careAttestation);
        } catch {
          setCareAttestation(null);
        }

        if (res.data.batchId) {
          try {
            const repRes = await axios.get(
              `${API_URL}/reputation/product/${encodeURIComponent(res.data.batchId)}`
            );
            setReputation(repRes.data);
          } catch {
            // no reputation record yet — that's fine, just skip
          }
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Product not found');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [batchId]);

  if (loading) {
    return <div className="public-page"><div className="public-card">Loading product...</div></div>;
  }

  if (error) {
    return (
      <div className="public-page"><div className="public-card" style={{ textAlign: 'center' }}>
        <h2>Product Not Found</h2>
        <p>{error}</p>
      </div></div>
    );
  }

  const trustColor = {
    Excellent: '#2E7D32',
    Good: '#66BB6A',
    Average: '#FBC02D',
    Poor: '#F57C00',
    Critical: '#C62828'
  };
  const formatDate = (value) => value
    ? new Date(value).toLocaleDateString()
    : 'Not provided';

  return (
    <div className="public-page"><div className="public-card">
      <div className="public-hero">
        <h2 style={{ margin: 0 }}>TABASC Product Traceability</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14 }}>Trust-Aware Blockchain Agricultural Supply Chain</p>
        <span className={product.verifiedOnChain ? 'verification-badge' : 'verification-warning'}>
          {product.verifiedOnChain
            ? '✓ Product data matches its on-chain record'
            : 'Data mismatch: product details could not be verified'}
        </span>
      </div>

      <div className="public-section">
        <h3 style={{ marginTop: 0 }}>{product.name}</h3>
        <span className="status-badge">{product.currentStatus}</span>
        {product.isRecalled && (
          <p className="error-message" role="alert">
            This product has been recalled. Do not consume or distribute it.
          </p>
        )}
        {product.expired && (
          <p className="error-message" role="alert">This product is past its expiry date.</p>
        )}
        {product.description && <p>{product.description}</p>}
        <div className="passport-grid">
          <div className="passport-item"><span>Batch ID</span><strong>{product.batchId}</strong></div>
          <div className="passport-item"><span>Category</span><strong>{product.category}</strong></div>
          <div className="passport-item"><span>Quantity</span><strong>{product.quantity} {product.unit}</strong></div>
          <div className="passport-item"><span>Farmer</span><strong>{product.farmer?.name || 'Not provided'}</strong></div>
          <div className="passport-item"><span>Harvest date</span><strong>{formatDate(product.harvestDate)}</strong></div>
          <div className="passport-item"><span>Expiry date</span><strong>{formatDate(product.expiryDate)}</strong></div>
        </div>
        {product.transactionHash && (
          <div className="transaction-panel">
            <strong>Registration transaction</strong>
            <span className="transaction-hash">{product.transactionHash}</span>
          </div>
        )}
      </div>

      {reputation && (
        <div className="public-section" style={{
          borderLeft: `6px solid ${trustColor[reputation.trustLevel] || '#999'}`
        }}>
          <h4 style={{ marginTop: 0 }}>Farmer Trust Score</h4>
          <p style={{ fontSize: 24, fontWeight: 'bold', margin: '4px 0' }}>
            {reputation.finalScore} / 1000
          </p>
          <p style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: 12,
            background: trustColor[reputation.trustLevel] || '#999', color: 'white', fontSize: 14
          }}>
            {reputation.trustLevel}
          </p>
          <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
            Based on {reputation.totalBatches} evaluated batches
          </p>
        </div>
      )}

      <StorageCareAttestation care={careAttestation} />

      <div className="public-section">
        <h4 style={{ marginTop: 0 }}>Supply Chain Journey</h4>
        {history.length === 0 ? (
          <div className="empty-state">No tracking history has been recorded for this batch yet.</div>
        ) : (
          <ul className="timeline">
            {history.map((h, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <strong>{h.status}</strong> — {h.location}
                <br />
                <span style={{ fontSize: 13, color: '#666' }}>{h.timestamp}</span>
                {h.notes && <div style={{ fontSize: 13, fontStyle: 'italic' }}>{h.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </div></div>

      <p style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 16 }}>
        Data verified on Ethereum-compatible blockchain via TABASC
      </p>
    </div>
  );
}

export default ProductScan;