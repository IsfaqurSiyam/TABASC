import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

import FarmerDashboard from '../components/Farmer/FarmerDashboard';
import DistributorDashboard from '../components/Distributor/DistributorDashboard';
import RetailerDashboard from '../components/Retailer/RetailerDashboard';
import ConsumerDashboard from '../components/Consumer/ConsumerDashboard';
import InspectorDashboard from '../components/Inspector/InspectorDashboard';
import AdminDashboard from '../components/Admin/AdminDashboard';

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderRoleDashboard = () => {
    switch (user.role) {
      case 'farmer':
        return <FarmerDashboard />;
      case 'distributor':
        return <DistributorDashboard />;
      case 'retailer':
        return <RetailerDashboard />;
      case 'consumer':
        return <ConsumerDashboard />;
      case 'inspector':
        return <InspectorDashboard />;
      case 'admin':
        return <AdminDashboard />;
      default:
        return <p>Unknown role</p>;
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand-mark">TABASC <span>●</span></div>
        <nav className="topnav" aria-label="Dashboard navigation">
          <a className="active" href="#overview">Overview</a>
          <a href="#workspace">Workspace</a>
          <a href="#records">Records</a>
        </nav>
        <div className="user-area">
          <span>
            {user.name} ({user.role})
          </span>
          <button onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        {user.requestedRole && user.role === 'consumer' && (
          <div className="approval-notice" role="status">
            <strong>Role request pending:</strong> your request for {user.requestedRole} access is awaiting administrator approval.
            You can use your consumer account while it is reviewed.
          </div>
        )}
        <div id="overview" className="dashboard-workspace">
          {renderRoleDashboard()}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;