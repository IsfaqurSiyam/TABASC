import React, { lazy, Suspense, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { API_URL } from '../../config/api';

const ReputationScanner = lazy(() => import('../Common/ReputationScanner'));

function ConsumerDashboard() {
  const [batchId, setBatchId] = useState('');
  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [feedbackScore, setFeedbackScore] = useState(5);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackEligibility, setFeedbackEligibility] = useState(null);
  const [feedbackEligibilityLoading, setFeedbackEligibilityLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    setProduct(null);
    setHistory([]);
    setFeedbackEligibility(null);
    setFeedbackMsg('');
    setFeedbackError('');
    setFeedbackEligibilityLoading(true);
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/products/batch/${batchId}`);
      setProduct(res.data);

      const [trackResult, eligibilityResult] = await Promise.allSettled([
        axios.get(`${API_URL}/tracking/${res.data.blockchainId}`),
        axios.get(`${API_URL}/reputation/feedback/${encodeURIComponent(res.data.batchId)}`)
      ]);
      if (trackResult.status === 'fulfilled') {
        setHistory(trackResult.value.data.history);
      } else {
        setError(trackResult.reason.response?.data?.message || 'Unable to load product journey');
      }
      if (eligibilityResult.status === 'fulfilled') {
        setFeedbackEligibility(eligibilityResult.value.data);
      } else {
        setFeedbackError(
          eligibilityResult.reason.response?.data?.message || 'Unable to check feedback eligibility'
        );
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Product not found');
    } finally {
      setLoading(false);
      setFeedbackEligibilityLoading(false);
    }
  };

  const handleFeedback = async () => {
    setFeedbackMsg('');
    setFeedbackError('');
    setFeedbackLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/reputation/reviews`,
        { batchId: product.batchId, rating: Number(feedbackScore) }
      );
      setFeedbackMsg(response.status === 202
        ? `${response.data.message} Transaction: ${response.data.txHash}`
        : `${response.data.message}. Transaction: ${response.data.txHash}`);
      setFeedbackEligibility({
        canSubmit: false,
        reason: response.status === 202
          ? 'Your feedback transaction is recorded; database synchronization is pending.'
          : 'Feedback has already been submitted for this product.'
      });
    } catch (err) {
      setFeedbackError(err.response?.data?.message || 'Review submission failed');
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div className="role-dashboard">
      <h2>Consumer — Product Traceability</h2>
      <div className="role-hero">
        <div>
          <p className="hero-kicker">Consumer verification</p>
          <h2>Know the story behind what you buy.</h2>
          <p>Scan a reputation QR code or search a batch to explore its origin, journey, and verified trust record.</p>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><strong>01</strong><span>Search a batch</span></div>
        <div className="kpi-card"><strong>02</strong><span>Follow its journey</span></div>
        <div className="kpi-card"><strong>03</strong><span>Verify reputation</span></div>
        <div className="kpi-card"><strong>✓</strong><span>Make informed choices</span></div>
      </div>
      <div className="workflow-strip">
        <div className="workflow-step"><b>1</b><div><strong>Find the product</strong><span>Enter a batch ID or scan a stakeholder QR code.</span></div></div>
        <div className="workflow-step"><b>2</b><div><strong>Review the journey</strong><span>Inspect origin, movement, status, and available notes.</span></div></div>
        <div className="workflow-step"><b>3</b><div><strong>Verify trust</strong><span>Use the reputation score to make an informed choice.</span></div></div>
      </div>
      <Suspense fallback={<p>Loading QR scanner...</p>}>
        <ReputationScanner />
      </Suspense>

      <form id="workspace" onSubmit={handleSearch} style={{ marginBottom: 24, maxWidth: 500 }}>
        <div className="section-heading">
          <h3>Trace a product</h3>
          <p>Search by batch ID</p>
        </div>
        <label htmlFor="consumer-batch-id">Enter Batch ID (from product QR code)</label><br />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input
            id="consumer-batch-id"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="e.g. BATCH-2026-001"
            required
            style={{ flex: 1, padding: 8 }}
          />
          <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {product && (
        <div id="records" style={{ border: '1px solid #ccc', padding: 16, maxWidth: 600 }}>
          <h3>{product.name}</h3>
          <p><strong>Batch ID:</strong> {product.batchId}</p>
          <p><strong>Category:</strong> {product.category}</p>
          <p><strong>Current Status:</strong> {product.currentStatus}</p>
          <p><strong>Farmer:</strong> {product.farmer?.name} — {product.farmer?.location}</p>

          <h4>Supply Chain History</h4>
          {history.length === 0 ? (
            <p>No tracking history yet.</p>
          ) : (
            <ul>
              {history.map((h, i) => (
                <li key={i}>
                  <strong>{h.status}</strong> at {h.location} — {h.timestamp}
                  {h.notes && <em> ({h.notes})</em>}
                </li>
              ))}
            </ul>
          )}

          <p style={{ marginTop: 16 }}>
            <Link to={`/scan/${product.batchId}`}>View public traceability page →</Link>
          </p>

          <hr style={{ margin: '16px 0' }} />

          <h4>Leave Feedback</h4>
          {feedbackMsg && <p style={{ color: 'green' }}>{feedbackMsg}</p>}
          {feedbackError && <p style={{ color: 'red' }}>{feedbackError}</p>}
          {feedbackEligibilityLoading && <p>Checking feedback eligibility...</p>}
          {feedbackEligibility?.reason && <p>{feedbackEligibility.reason}</p>}
          {feedbackEligibility?.canSubmit && (
            <>
              <label htmlFor="feedback-rating">Your rating (1–10)</label><br />
              <input
                id="feedback-rating"
                type="number" min="1" max="10"
                step="1"
                value={feedbackScore}
                onChange={(e) => setFeedbackScore(e.target.value)}
                style={{ padding: 6, marginRight: 8 }}
              />
              <button
                type="button"
                onClick={handleFeedback}
                disabled={feedbackLoading || feedbackEligibilityLoading}
                style={{ padding: '6px 12px' }}
              >
                {feedbackLoading ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ConsumerDashboard;