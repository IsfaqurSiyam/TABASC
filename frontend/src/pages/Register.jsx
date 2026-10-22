import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    requestedRole: '',
    phone: '',
    location: ''
  });
  const [agreement, setAgreement] = useState(null);
  const [agreementError, setAgreementError] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register, logout } = useAuth();

  useEffect(() => {
    let active = true;
    axios.get(`${API_URL}/auth/agreement`)
      .then((response) => {
        if (active) setAgreement(response.data);
      })
      .catch(() => {
        if (active) setAgreementError('The participation agreement could not be loaded. Please try again later.');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreement || !agreementAccepted) return;
    setError('');
    setLoading(true);
    try {
      const registrationData = {
        ...formData,
        agreementAccepted,
        agreementVersion: agreement.version
      };
      if (!registrationData.requestedRole) delete registrationData.requestedRole;
      await register(registrationData);
      logout();
      setRegistered(true);
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
          {registered && (
            <p role="status">
              Your account was created and is awaiting administrator approval. You can log in after it is approved.
              {' '}<Link to="/login">Go to login</Link>
            </p>
          )}
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
          <input type="password" name="password" value={formData.password} onChange={handleChange} required minLength="8" pattern=".*\d.*" title="Use at least 8 characters and include a digit."
            style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Supply-chain role request (optional)</label><br />
          <select name="requestedRole" value={formData.requestedRole} onChange={handleChange}
            style={{ width: '100%', padding: 8 }}>
            <option value="">Consumer account only</option>
            <option value="farmer">Farmer</option>
            <option value="distributor">Distributor</option>
            <option value="retailer">Retailer</option>
            <option value="inspector">Inspector</option>
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <p className="form-hint">
            New accounts start as consumers. A supply-chain role request is reviewed by an administrator.
            Your development wallet is generated and funded securely during registration.
          </p>
        </div>

        <section aria-labelledby="participation-agreement-title" style={{ marginBottom: 12 }}>
          <h3 id="participation-agreement-title">TABASC Participation Agreement</h3>
          {agreement ? (
            <>
              <p className="form-hint">Version {agreement.version}. Please read before creating your account.</p>
              <ol>
                {agreement.terms.map((term) => <li key={term}>{term}</li>)}
              </ol>
              <label>
                <input
                  type="checkbox"
                  checked={agreementAccepted}
                  onChange={(event) => setAgreementAccepted(event.target.checked)}
                  required
                />
                I have read and agree to the TABASC Participation Agreement.
              </label>
            </>
          ) : (
            <p className={agreementError ? 'error-message' : 'form-hint'} role={agreementError ? 'alert' : undefined}>
              {agreementError || 'Loading the participation agreement...'}
            </p>
          )}
        </section>

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

        <button type="submit" disabled={loading || registered || !agreement || !agreementAccepted} style={{ width: '100%', padding: 10 }}>
          {loading ? 'Registering...' : registered ? 'Awaiting approval' : 'Register'}
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