import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReputationQRCode from '../Common/ReputationQRCode';
import SupplyChainActions from '../Common/SupplyChainActions';

function RetailerDashboard() {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const selected = products.find((product) => product._id === selectedProduct);
  const nextStatus = selected?.currentStatus === 'Delivered'
    ? 'OnShelf'
    : selected?.currentStatus === 'OnShelf' ? 'Sold' : '';
  const eligibleProducts = products.filter((product) => !product.isRecalled &&
    !product.expired && ['Delivered', 'OnShelf'].includes(product.currentStatus));

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      const product = products.find(p => p._id === selectedProduct);
      if (!product || !nextStatus) throw new Error('Choose a product with a valid next status');
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/tracking/update`, {
        blockchainId: product.blockchainId,
        status: nextStatus,
        location,
        notes
      });
      setMessage(`Product status updated successfully! Gas used: ${res.data.gas?.gasUsed || 'recorded'}.`);
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
      <h2>Retailer Dashboard</h2>
      <div className="role-hero">
        <div>
          <p className="hero-kicker">Retail operations</p>
          <h2>Turn verified deliveries into trusted shelves.</h2>
          <p>Confirm receipt, update product availability, and keep customers close to the source of every batch.</p>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><strong>{products.length}</strong><span>Available products</span></div>
        <div className="kpi-card"><strong>{products.filter(p => p.currentStatus === 'Delivered').length}</strong><span>Awaiting shelf placement</span></div>
        <div className="kpi-card"><strong>{products.filter(p => p.currentStatus === 'OnShelf').length}</strong><span>On shelf</span></div>
        <div className="kpi-card"><strong>{products.filter(p => p.currentStatus === 'Sold').length}</strong><span>Sold batches</span></div>
      </div>
      <div className="workflow-strip">
        <div className="workflow-step"><b>1</b><div><strong>Confirm receipt</strong><span>Choose the delivered batch arriving at your store.</span></div></div>
        <div className="workflow-step"><b>2</b><div><strong>Set availability</strong><span>Mark products as on shelf or sold when their status changes.</span></div></div>
        <div className="workflow-step"><b>3</b><div><strong>Build confidence</strong><span>Keep product history available for customer verification.</span></div></div>
      </div>
      <ReputationQRCode />

      <form id="workspace" onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, maxWidth: 500 }}>
        <h3>Confirm Receipt / Update Availability</h3>

        {message && <p style={{ color: message.includes('success') ? 'green' : 'red' }}>{message}</p>}

        <div style={{ marginBottom: 10 }}>
          <label>Select Product</label><br />
          <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} required
            style={{ width: '100%', padding: 6 }}>
            <option value="">-- Select --</option>
            {eligibleProducts.map(p => (
              <option key={p._id} value={p._id}>{p.name} ({p.batchId}) — {p.currentStatus}</option>
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
          <label>Store Location</label><br />
          <input value={location} onChange={(e) => setLocation(e.target.value)} required
            style={{ width: '100%', padding: 6 }} placeholder="e.g. Gulshan Fresh Mart" />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Notes (optional — flag quality issues here)</label><br />
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', padding: 6 }} placeholder="e.g. minor bruising on 5% of batch" />
        </div>

        <button type="submit" disabled={loading || !selected || !nextStatus} style={{ padding: '8px 16px' }}>
          {loading ? 'Updating...' : 'Update Status'}
        </button>
      </form>

      <SupplyChainActions products={products} role="retailer" onComplete={fetchProducts} />

      <div className="section-heading">
        <h3>All Products</h3>
        <p>Confirm the status of every received batch</p>
      </div>
      <table id="records" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Batch ID</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p._id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{p.name}</td>
              <td style={{ padding: 8 }}>{p.batchId}</td>
              <td style={{ padding: 8 }}>{p.currentStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RetailerDashboard;