import React, { useState, useEffect } from 'react';
import axios from 'axios';

function InspectorDashboard() {
  const [products, setProducts] = useState([]);

  const [batchId, setBatchId] = useState('');
  const [stakeholderWallet, setStakeholderWallet] = useState('');
  const [qualityScore, setQualityScore] = useState(5);
  const [deliveryScore, setDeliveryScore] = useState(5);
  const [complaintScore, setComplaintScore] = useState(5);
  const [complianceScore, setComplianceScore] = useState(5);
  const [feedbackScore, setFeedbackScore] = useState(5);

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [lookupWallet, setLookupWallet] = useState('');
  const [reputation, setReputation] = useState(null);
  const [lookupError, setLookupError] = useState('');

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/products`);
      setProducts(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const calculatePreview = () => {
    return (
      (Number(qualityScore) * 30) +
      (Number(deliveryScore) * 25) +
      (Number(complaintScore) * 20) +
      (Number(complianceScore) * 15) +
      (Number(feedbackScore) * 10)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/reputation/score`, {
        batchId,
        stakeholderWallet,
        qualityScore: Number(qualityScore),
        deliveryScore: Number(deliveryScore),
        complaintScore: Number(complaintScore),
        complianceScore: Number(complianceScore),
        feedbackScore: Number(feedbackScore)
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Score submission failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    setLookupError('');
    setReputation(null);
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/reputation/${lookupWallet}`);
      setReputation(res.data);
    } catch (err) {
      setLookupError(err.response?.data?.message || 'No reputation record found');
    }
  };

  const scoreInput = (label, value, setValue) => (
    <div style={{ marginBottom: 10 }}>
      <label>{label} (0–10): {value}</label><br />
      <input
        type="range" min="0" max="10" value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: '100%' }}
      />
    </div>
  );

  return (
    <div className="role-dashboard">
      <h2>Inspector Dashboard — MFSRS Score Submission</h2>
      <div className="role-hero">
        <div>
          <p className="hero-kicker">Quality assurance</p>
          <h2>Make trust measurable.</h2>
          <p>Evaluate stakeholder performance and publish transparent reputation scores backed by blockchain records.</p>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><strong>{products.length}</strong><span>Products to review</span></div>
        <div className="kpi-card"><strong>5</strong><span>Scoring dimensions</span></div>
        <div className="kpi-card"><strong>0–10</strong><span>Score range</span></div>
        <div className="kpi-card"><strong>1000</strong><span>Maximum reputation</span></div>
      </div>
      <div className="workflow-strip">
        <div className="workflow-step"><b>1</b><div><strong>Select a batch</strong><span>Choose the stakeholder and product record to evaluate.</span></div></div>
        <div className="workflow-step"><b>2</b><div><strong>Score five dimensions</strong><span>Assess quality, delivery, complaints, compliance, and feedback.</span></div></div>
        <div className="workflow-step"><b>3</b><div><strong>Publish the result</strong><span>Submit the score and preserve its transaction evidence.</span></div></div>
      </div>

      <form id="workspace" onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, maxWidth: 500 }}>
        <h3>Submit Reputation Score</h3>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {result && (
          <div style={{ background: '#e8f5e9', padding: 12, marginBottom: 12 }}>
            <p><strong>Score submitted successfully!</strong></p>
            <p>Final Score: {result.finalScore} / 1000</p>
            <p>Trust Level: {result.trustLevel}</p>
            {result.gas && <p>Gas used: {result.gas.gasUsed} · Cost: {result.gas.costEther} ETH</p>}
            <p style={{ fontSize: 12, wordBreak: 'break-all' }}>Tx: {result.txHash}</p>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label>Batch ID</label><br />
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} required
            style={{ width: '100%', padding: 6 }}>
            <option value="">-- Select Batch --</option>
            {products.map(p => (
              <option key={p._id} value={p.batchId}>{p.batchId} — {p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Stakeholder Wallet Address</label><br />
          <input value={stakeholderWallet} onChange={(e) => setStakeholderWallet(e.target.value)}
            placeholder="0x... (farmer's wallet)" required style={{ width: '100%', padding: 6 }} />
        </div>

        {scoreInput('Product Quality (Q)', qualityScore, setQualityScore)}
        {scoreInput('Delivery Performance (D)', deliveryScore, setDeliveryScore)}
        {scoreInput('Complaint History (CH)', complaintScore, setComplaintScore)}
        {scoreInput('Regulatory Compliance (RC)', complianceScore, setComplianceScore)}
        {scoreInput('Consumer Feedback (CF)', feedbackScore, setFeedbackScore)}

        <div style={{ background: '#f0f0f0', padding: 10, marginBottom: 10 }}>
          <strong>Preview Score: {calculatePreview()} / 1000</strong>
        </div>

        <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? 'Submitting to blockchain...' : 'Submit Score On-Chain'}
        </button>
      </form>

      <div id="records" style={{ border: '1px solid #ccc', padding: 16, maxWidth: 500 }}>
        <h3>Look Up Reputation Score</h3>
        <form onSubmit={handleLookup}>
          {lookupError && <p style={{ color: 'red' }}>{lookupError}</p>}
          <input
            value={lookupWallet}
            onChange={(e) => setLookupWallet(e.target.value)}
            placeholder="Enter wallet address"
            style={{ width: '70%', padding: 6, marginRight: 8 }}
          />
          <button type="submit" style={{ padding: '6px 12px' }}>Look Up</button>
        </form>

        {reputation && (
          <div style={{ marginTop: 12 }}>
            <p><strong>Final Score:</strong> {reputation.finalScore} / 1000</p>
            <p><strong>Trust Level:</strong> {reputation.trustLevel}</p>
            <p><strong>Total Batches:</strong> {reputation.totalBatches}</p>
            <p><strong>Last Updated:</strong> {reputation.lastUpdated}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default InspectorDashboard;