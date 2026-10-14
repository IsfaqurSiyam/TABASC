import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="brand-mark">TABASC <span>●</span></div>
        <h1>Trust in every journey.</h1>
        <p>Trace agricultural products from harvest to shelf with transparent, blockchain-backed records.</p>
        <div className="auth-points"><span>Farm to table</span><span>Verified movement</span><span>Trusted records</span></div>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p className="subtitle">Sign in to your TABASC workspace.</p>
          {error && <p className="error-message">{error}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label><br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Password</label><br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <p style={{ marginTop: 18, color: '#6d7b76', fontSize: 14 }}>
        Don't have an account? <Link to="/register">Register</Link>
      </p>
        </div>
      </div>
    </div>
  );
}

export default Login;