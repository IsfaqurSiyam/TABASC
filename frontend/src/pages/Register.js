import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'farmer',
    walletAddress: '',
    phone: '',
    location: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(formData);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="brand-mark">TABASC <span>●</span></div>
        <h1>Make the supply chain visible.</h1>
        <p>Create your stakeholder account and help build a more transparent food ecosystem.</p>
        <div className="auth-points"><span>Secure identity</span><span>Role-based access</span><span>On-chain trust</span></div>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <h2>Create your account</h2>
          <p className="subtitle">Join the TABASC traceability network.</p>
          {error && <p className="error-message">{error}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Full Name</label><br />
          <input name="name" value={formData.name} onChange={handleChange} required
            style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Email</label><br />
          <input type="email" name="email" value={formData.email} onChange={handleChange} required
            style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Password</label><br />
          <input type="password" name="password" value={formData.password} onChange={handleChange} required
            style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Role</label><br />
          <select name="role" value={formData.role} onChange={handleChange}
            style={{ width: '100%', padding: 8 }}>
            <option value="farmer">Farmer</option>
            <option value="distributor">Distributor</option>
            <option value="retailer">Retailer</option>
            <option value="consumer">Consumer</option>
            <option value="inspector">Inspector</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Wallet Address (from Ganache){formData.role === 'farmer' ? ' (required)' : ''}</label><br />
          <input name="walletAddress" value={formData.walletAddress} onChange={handleChange}
            placeholder="0x..." required={formData.role === 'farmer'}
            style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Phone</label><br />
          <input name="phone" value={formData.phone} onChange={handleChange}
            style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Location</label><br />
          <input name="location" value={formData.location} onChange={handleChange}
            style={{ width: '100%', padding: 8 }} />
        </div>

        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
      <p style={{ marginTop: 18, color: '#6d7b76', fontSize: 14 }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
        </div>
      </div>
    </div>
  );
}

export default Register;