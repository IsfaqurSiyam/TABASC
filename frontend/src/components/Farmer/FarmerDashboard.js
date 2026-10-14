import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReputationQRCode from '../Common/ReputationQRCode';

function FarmerDashboard() {
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', description: '', batchId: '',
    category: 'vegetables', quantity: '', unit: 'kg',
    harvestDate: '', expiryDate: ''
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/products/farmer/myproducts`);
      setProducts(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/products/register`, formData);
      setMessage(`Product registered! Blockchain ID: ${res.data.blockchainId}`);
      setShowForm(false);
      setFormData({
        name: '', description: '', batchId: '',
        category: 'vegetables', quantity: '', unit: 'kg',
        harvestDate: '', expiryDate: ''
      });
      fetchProducts();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="role-dashboard">
      <h2>Farmer Dashboard</h2>
      <div className="role-hero">
        <div>
          <p className="hero-kicker">Farm operations</p>
          <h2>Bring every harvest into view.</h2>
          <p>Register batches, keep product records organized, and give every stakeholder a trusted origin story.</p>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><strong>{products.length}</strong><span>Registered products</span></div>
        <div className="kpi-card"><strong>{products.filter(p => p.currentStatus === 'Harvested').length}</strong><span>At harvest stage</span></div>
        <div className="kpi-card"><strong>{products.filter(p => p.currentStatus === 'Delivered').length}</strong><span>Delivered batches</span></div>
        <div className="kpi-card"><strong>On-chain</strong><span>Record status</span></div>
      </div>
      <div className="workflow-strip">
        <div className="workflow-step"><b>1</b><div><strong>Register a batch</strong><span>Record harvest details and create its blockchain identity.</span></div></div>
        <div className="workflow-step"><b>2</b><div><strong>Follow movement</strong><span>See status changes as products move through the chain.</span></div></div>
        <div className="workflow-step"><b>3</b><div><strong>Share proof</strong><span>Use your reputation QR code to make trust easy to verify.</span></div></div>
      </div>
      <ReputationQRCode />

      <button onClick={() => setShowForm(!showForm)} style={{ padding: '8px 16px', marginBottom: 16 }}>
        {showForm ? 'Cancel' : '+ Register New Product'}
      </button>

      {message && <p style={{ color: message.includes('registered') ? 'green' : 'red' }}>{message}</p>}

      {showForm && (
        <form id="workspace" onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, maxWidth: 500 }}>
          <div style={{ marginBottom: 10 }}>
            <label>Product Name</label><br />
            <input name="name" value={formData.name} onChange={handleChange} required style={{ width: '100%', padding: 6 }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Description</label><br />
            <input name="description" value={formData.description} onChange={handleChange} style={{ width: '100%', padding: 6 }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Batch ID</label><br />
            <input name="batchId" value={formData.batchId} onChange={handleChange} required style={{ width: '100%', padding: 6 }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Category</label><br />
            <select name="category" value={formData.category} onChange={handleChange} style={{ width: '100%', padding: 6 }}>
              <option value="vegetables">Vegetables</option>
              <option value="fruits">Fruits</option>
              <option value="grains">Grains</option>
              <option value="dairy">Dairy</option>
              <option value="meat">Meat</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Quantity</label><br />
            <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} required style={{ width: '100%', padding: 6 }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Harvest Date</label><br />
            <input type="date" name="harvestDate" value={formData.harvestDate} onChange={handleChange} style={{ width: '100%', padding: 6 }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>Expiry Date</label><br />
            <input type="date" name="expiryDate" value={formData.expiryDate} onChange={handleChange} style={{ width: '100%', padding: 6 }} />
          </div>
          <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
            {loading ? 'Registering...' : 'Register Product'}
          </button>
        </form>
      )}

      <div className="section-heading">
        <h3>My Products ({products.length})</h3>
        <p>Recent batch records and current status</p>
      </div>
      <table id="records" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Batch ID</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Status</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p._id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{p.name}</td>
              <td style={{ padding: 8 }}>{p.batchId}</td>
              <td style={{ padding: 8 }}>{p.currentStatus}</td>
              <td style={{ padding: 8 }}>{p.quantity} {p.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default FarmerDashboard;