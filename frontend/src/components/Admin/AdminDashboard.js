import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

function AdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingUser, setWorkingUser] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [overviewResponse, usersResponse] = await Promise.all([
        axios.get(`${process.env.REACT_APP_API_URL}/admin/overview`),
        axios.get(`${process.env.REACT_APP_API_URL}/admin/users`, {
          params: { status: 'all', page: 1, limit: 100 }
        })
      ]);
      setOverview(overviewResponse.data);
      setUsers(usersResponse.data.users);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load administrator data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateRole = async (user, action) => {
    setWorkingUser(user._id);
    setError('');
    try {
      await axios.patch(`${process.env.REACT_APP_API_URL}/admin/users/${user._id}/role`, {
        action
      });
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Unable to ${action} role request`);
    } finally {
      setWorkingUser('');
    }
  };

  const updateActive = async (user) => {
    setWorkingUser(user._id);
    setError('');
    try {
      await axios.patch(`${process.env.REACT_APP_API_URL}/admin/users/${user._id}/active`, {
        isActive: !user.isActive
      });
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update account status');
    } finally {
      setWorkingUser('');
    }
  };

  if (loading) return <p>Loading administrator overview...</p>;

  const pendingUsers = users.filter((user) => user.requestedRole);
  return (
    <div className="role-dashboard">
      <h2>Administrator Dashboard</h2>
      <div className="role-hero">
        <div>
          <p className="hero-kicker">Network administration</p>
          <h2>Manage access and monitor system health.</h2>
          <p>Approve supply-chain role requests and review synchronization status.</p>
        </div>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {overview && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <strong>{Object.values(overview.userCounts || {}).reduce((total, count) => total + count, 0)}</strong>
              <span>Accounts</span>
            </div>
            <div className="kpi-card">
              <strong>{pendingUsers.length}</strong>
              <span>Pending role requests</span>
            </div>
            <div className="kpi-card">
              <strong>{overview.pendingSyncs}</strong>
              <span>Pending data syncs</span>
            </div>
            <div className="kpi-card">
              <strong>{overview.lastReconcileResult?.failed ?? '—'}</strong>
              <span>Last reconcile failures</span>
            </div>
          </div>
          <section>
            <h3>Product status</h3>
            <div className="admin-status-grid">
              {Object.entries(overview.productCounts || {}).map(([status, count]) => (
                <div className="kpi-card" key={status}>
                  <strong>{count}</strong><span>{status}</span>
                </div>
              ))}
            </div>
            <p>
              Last reconciliation: {overview.lastReconcileResult?.completedAt
                ? new Date(overview.lastReconcileResult.completedAt).toLocaleString()
                : 'Not run yet'}
            </p>
          </section>
        </>
      )}
      <section id="records">
        <div className="section-heading">
          <h3>Role requests and accounts</h3>
          <button type="button" onClick={refresh}>Refresh</button>
        </div>
        {users.length === 0 ? (
          <p className="empty-state">No accounts were returned.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Role</th><th>Request</th>
                  <th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.requestedRole || '—'}</td>
                    <td>{user.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      {user.requestedRole && (
                        <>
                          <button
                            type="button"
                            disabled={workingUser === user._id}
                            onClick={() => updateRole(user, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={workingUser === user._id}
                            onClick={() => updateRole(user, 'reject')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {user.role !== 'admin' && (
                        <button
                          type="button"
                          disabled={workingUser === user._id}
                          onClick={() => updateActive(user)}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminDashboard;
