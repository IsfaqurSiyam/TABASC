import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReputationQRCode from '../Common/ReputationQRCode';
import SupplyChainActions from '../Common/SupplyChainActions';
import { API_URL } from '../../config/api';

function DistributorDashboard() {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const selected = products.find((product) => product._id === selectedProduct);
  const statusOrder = ['Harvested', 'PickedUp', 'InTransit', 'Delivered', 'OnShelf', 'Sold'];
  const nextStatusIndex = selected ? statusOrder.indexOf(selected.currentStatus) + 1 : -1;
  const nextStatus = nextStatusIndex > 0 && nextStatusIndex <= 3
    ? statusOrder[nextStatusIndex]
    : '';
  const eligibleProducts = products.filter((product) => !product.isRecalled &&
    ['Harvested', 'PickedUp', 'InTransit'].includes(product.currentStatus));

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      const product = products.find(p => p._id === selectedProduct);
      if (!product || !nextStatus) throw new Error('Choose a product with a valid next status');
      const res = await axios.post(`${API_URL}/tracking/update`, {
        blockchainId: product.blockchainId,
        status: nextStatus,
        location,
        notes
      });
      setMessage(`Shipment status updated successfully! Gas used: ${res.data.gas?.gasUsed || 'recorded'}.`);
      setLocation('');
      setNotes('');
      fetchProducts();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="role-dashboard">
      <h2>Distributor Dashboard</h2>
      <div className="role-hero">
        <div>
          <p className="hero-kicker">Logistics control</p>
          <h2>Keep products moving with confidence.</h2>
          <p>Update each handoff as it happens and maintain a clear chain of custody from farm to market.</p>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><strong>{products.length}</strong><span>Products in system</span></div>
        <div className="kpi-card"><strong>{products.filter(p => p.currentStatus === 'PickedUp').length}</strong><span>Picked up</span></div>
        <div className="kpi-card"><strong>{products.filter(p => p.currentStatus === 'InTransit').length}</strong><span>In transit</span></div>
        <div className="kpi-card"><strong>{products.filter(p => p.currentStatus === 'Delivered').length}</strong><span>Delivered</span></div>
      </div>
      <div className="workflow-strip">
        <div className="workflow-step"><b>1</b><div><strong>Choose a product</strong><span>Select the batch that has moved into your care.</span></div></div>
        <div className="workflow-step"><b>2</b><div><strong>Update the handoff</strong><span>Record location, status, and optional delivery notes.</span></div></div>
        <div className="workflow-step"><b>3</b><div><strong>Preserve the trail</strong><span>Each update becomes part of the product journey.</span></div></div>
      </div>
      <ReputationQRCode />

      <form id="workspace" onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, maxWidth: 500 }}>
        <h3>Update Shipment Status</h3>

        {message && <p style={{ color: message.includes('success') ? 'green' : 'red' }}>{message}</p>}

        <div style={{ marginBottom: 10 }}>
          <label>Select Product</label><br />
          <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} required
            style={{ width: '100%', padding: 6 }}>
            <option value="">-- Select --</option>
            {eligibleProducts.map(p => (
              <option key={p._id} value={p._id}>{p.name} ({p.batchId})</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>New Status</label><br />
          <select value={nextStatus} disabled={!nextStatus} style={{ width: '100%', padding: 6 }}>
            {nextStatus && <option value={nextStatus}>{nextStatus}</option>}
          </select>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Location</label><br />
          <input value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={120}
            style={{ width: '100%', padding: 6 }} placeholder="e.g. Dhaka Distribution Hub" />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Notes (optional)</label><br />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}
            style={{ width: '100%', padding: 6 }} />
        </div>

        <button type="submit" disabled={loading || !selected || !nextStatus} style={{ padding: '8px 16px' }}>
          {loading ? 'Updating...' : 'Update Status'}
        </button>
      </form>

      <SupplyChainActions products={products} role="distributor" onComplete={fetchProducts} />

      <div className="section-heading">
        <h3>All Products in System</h3>
        <p>Monitor the latest supply-chain movement</p>
      </div>
      <table id="records" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Batch ID</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Farmer</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p._id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{p.name}</td>
              <td style={{ padding: 8 }}>{p.batchId}</td>
              <td style={{ padding: 8 }}>{p.farmer?.name}</td>
              <td style={{ padding: 8 }}>{p.currentStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DistributorDashboard;