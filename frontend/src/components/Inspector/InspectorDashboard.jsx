import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import SupplyChainActions from '../Common/SupplyChainActions';
import { API_URL } from '../../config/api';

function InspectorDashboard() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);

  const [batchId, setBatchId] = useState('');
  const [participants, setParticipants] = useState([]);
  const [stakeholderWallet, setStakeholderWallet] = useState('');
  const [qualityScore, setQualityScore] = useState(5);
  const [complianceScore, setComplianceScore] = useState(5);

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [lookupWallet, setLookupWallet] = useState('');
  const [reputation, setReputation] = useState(null);
  const [lookupError, setLookupError] = useState('');

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API_URL}/products`);
      setProducts(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const loadParticipants = async (selectedBatchId) => {
    setBatchId(selectedBatchId);
    setError('');
    setResult(null);
    setParticipants([]);
    setStakeholderWallet('');
    const product = products.find((entry) => entry.batchId === selectedBatchId);
    if (!product) return;
    try {
      const response = await axios.get(
        `${API_URL}/reputation/participants/${product.blockchainId}`
      );
      setParticipants(response.data.participants);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load product participants');
    }
  };

  const calculatePreview = () => {
    return `${qualityScore} / 10 quality, ${complianceScore} / 10 compliance`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/reputation/score`, {
        batchId,
        stakeholderWallet,
        qualityScore: Number(qualityScore),
        complianceScore: Number(complianceScore)
      });
      if (res.status === 202) {
        setResult({
          message: res.data.message,
          pendingSyncId: res.data.pendingSyncId,
          txHash: res.data.txHash,
          pendingSync: true
        });
      } else {
        setResult(res.data);
      }
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
      const res = await axios.get(`${API_URL}/reputation/${lookupWallet}`);
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
        <div className="kpi-card"><strong>2</strong><span>Inspector-assessed dimensions</span></div>
        <div className="kpi-card"><strong>0–10</strong><span>Score range</span></div>
        <div className="kpi-card"><strong>1000</strong><span>Maximum reputation</span></div>
      </div>
      <div className="workflow-strip">
        <div className="workflow-step"><b>1</b><div><strong>Select a batch</strong><span>Choose the stakeholder and product record to evaluate.</span></div></div>
        <div className="workflow-step"><b>2</b><div><strong>Inspect the batch</strong><span>Record quality and compliance; chain data derives delivery and consumer feedback.</span></div></div>
        <div className="workflow-step"><b>3</b><div><strong>Finalize a participant</strong><span>Publish a score for an address that participated in this product journey.</span></div></div>
      </div>

      <form id="workspace" onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, maxWidth: 500 }}>
        <h3>Submit Reputation Score</h3>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {result && (
          <div style={{ background: result.pendingSync ? '#fff8e1' : '#e8f5e9', padding: 12, marginBottom: 12 }}>
            <p><strong>{result.pendingSync ? 'Blockchain transaction recorded; database sync pending.' : 'Score submitted successfully!'}</strong></p>
            {result.message && <p>{result.message}</p>}
            {result.finalScore !== undefined && <p>Final Score: {result.finalScore} / 1000</p>}
            {result.trustLevel && <p>Trust Level: {result.trustLevel}</p>}
            {result.gas && <p>Gas used: {result.gas.gasUsed} · Cost: {result.gas.costEther} ETH</p>}
            <p style={{ fontSize: 12, wordBreak: 'break-all' }}>Tx: {result.txHash}</p>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label>Batch ID</label><br />
          <select value={batchId} onChange={(e) => loadParticipants(e.target.value)} required
            style={{ width: '100%', padding: 6 }}>
            <option value="">-- Select Batch --</option>
            {products.map(p => (
              <option key={p._id} value={p.batchId}>{p.batchId} — {p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Journey participant</label><br />
          <select
            value={stakeholderWallet}
            onChange={(e) => setStakeholderWallet(e.target.value)}
            required
            disabled={!participants.length}
            style={{ width: '100%', padding: 6 }}
          >
            <option value="">-- Select Participant --</option>
            {participants.map((participant) => (
              <option key={participant.walletAddress} value={participant.walletAddress}>
                {participant.name} — {participant.role} ({participant.walletAddress})
              </option>
            ))}
          </select>
        </div>

        {scoreInput('Product Quality (Q)', qualityScore, setQualityScore)}
        {scoreInput('Regulatory Compliance (RC)', complianceScore, setComplianceScore)}

        <div style={{ background: '#f0f0f0', padding: 10, marginBottom: 10 }}>
          <strong>{calculatePreview()}</strong>
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
      {user?.role === 'inspector' && (
        <SupplyChainActions products={products} role="inspector" onComplete={fetchProducts} />
      )}
    </div>
  );
}

export default InspectorDashboard;