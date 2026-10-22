import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../config/api';

function AdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingUser, setWorkingUser] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [overviewResponse, usersResponse] = await Promise.all([
        axios.get(`${API_URL}/admin/overview`),
        axios.get(`${API_URL}/admin/users`, {
          params: { status: 'all', page: userPage, limit: 100 }
        })
      ]);
      setOverview(overviewResponse.data);
      setUsers(usersResponse.data.users);
      setPendingApprovalCount(usersResponse.data.pendingApprovalCount);
      setUserTotal(usersResponse.data.total);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load administrator data');
    } finally {
      setLoading(false);
    }
  }, [userPage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateRole = async (user, action) => {
    setWorkingUser(user._id);
    setError('');
    try {
      await axios.patch(`${API_URL}/admin/users/${user._id}/role`, {
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
      await axios.patch(`${API_URL}/admin/users/${user._id}/active`, {
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
  const totalUserPages = Math.max(1, Math.ceil(userTotal / 100));
  return (
    <div className="role-dashboard">
      <h2>Administrator Dashboard</h2>
      <div className="role-hero">
        <div>
          <p className="hero-kicker">Network administration</p>
          <h2>Manage access and monitor system health.</h2>
          <p>Approve accounts and supply-chain roles, manage access, and review synchronization status.</p>
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
              <strong>{pendingApprovalCount}</strong>
              <span>Pending account approvals</span>
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
        <p>Page {userPage} of {totalUserPages} ({userTotal} accounts)</p>
        {users.length === 0 ? (
          <p className="empty-state">No accounts were returned.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Role</th><th>Request</th>
                  <th>Account approval</th><th>Access</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.requestedRole || '—'}</td>
                    <td>{user.approvalStatus === 'pending' ? 'Pending approval' : 'Approved'}</td>
                    <td>{user.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      {user.role !== 'admin' && user.approvalStatus === 'pending' && (
                        <button
                          type="button"
                          disabled={workingUser === user._id}
                          onClick={() => updateActive(user)}
                        >
                          Approve &amp; activate
                        </button>
                      )}
                      {user.requestedRole && (
                        <>
                          <button
                            type="button"
                            disabled={workingUser === user._id || user.approvalStatus === 'pending'}
                            onClick={() => updateRole(user, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={workingUser === user._id || user.approvalStatus === 'pending'}
                            onClick={() => updateRole(user, 'reject')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {user.role !== 'admin' && user.approvalStatus !== 'pending' && (
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
        <div className="section-heading">
          <button
            type="button"
            disabled={userPage <= 1}
            onClick={() => setUserPage((page) => Math.max(1, page - 1))}
          >
            Previous accounts
          </button>
          <button
            type="button"
            disabled={userPage >= totalUserPages}
            onClick={() => setUserPage((page) => Math.min(totalUserPages, page + 1))}
          >
            Next accounts
          </button>
        </div>
      </section>
    </div>
  );
}

export default AdminDashboard;
