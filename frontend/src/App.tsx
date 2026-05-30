import React, { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { KanbanBoard } from './components/KanbanBoard';
import { NotificationBanner } from './components/NotificationBanner';
import { api } from './services/api';
import { CustomDialog } from './components/CustomDialog';

type TabView = 'dashboard' | 'board';

export const App: React.FC = () => {
  const [user, setUser] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Dynamic refresh trigger to force child components to reload when events occur
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState('');

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  // Restore session on boot
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('accessToken');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }

    // Auth expiration event listener
    const handleAuthExpired = () => {
      setUser(null);
      setDialogMessage('Your session has expired. Please sign in again.');
      setDialogOpen(true);
    };

    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        await api.auth.logout(refreshToken);
      } catch (e) {
        console.error('Logout request failed:', e);
      }
    }
    localStorage.clear();
    setUser(null);
    setSelectedProjectId(null);
    setActiveTab('dashboard');
  };

  if (!user) {
    return (
      <div className="bg-primary" style={{ minHeight: '100vh', background: '#0a0c10' }}>
        <Auth onAuthSuccess={setUser} />
      </div>
    );
  }

  return (
    <div className="d-flex flex-column" style={{ minHeight: '100vh', backgroundColor: '#0a0c10' }}>
      {/* Top Navbar */}
      <nav className="navbar navbar-expand-lg border-bottom" style={{ background: 'rgba(19,23,34,0.85)', borderColor: 'rgba(255,255,255,0.06) !important', backdropFilter: 'blur(10px)' }}>
        <div className="container-fluid px-4">
          <span className="navbar-brand fw-bold glow-text-cyan fs-4 d-flex align-items-center gap-2" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('dashboard')}>
            <i className="bi bi-intersect text-cyan animate-spin-slow"></i> NxtWave Tracker
          </span>

          <div className="d-flex align-items-center gap-3">
            {/* Header User profile */}
            <div className="text-end d-none d-sm-block">
              <span className="d-block text-white fw-semibold fs-7">{user.name}</span>
              <span className="d-block text-muted fs-8">{user.role}</span>
            </div>

            <button className="btn btn-outline-danger btn-sm px-3 border-0 rounded-circle py-2" onClick={handleLogout} title="Sign Out">
              <i className="bi bi-box-arrow-right fs-5"></i>
            </button>
          </div>
        </div>
      </nav>

      {/* Navigation Sub-Tabs bar */}
      <div className="border-bottom py-2" style={{ background: 'rgba(10,12,16,0.9)', borderColor: 'rgba(255,255,255,0.04) !important' }}>
        <div className="container-fluid px-4 d-flex gap-3">
          <button
            className={`custom-nav-link border-0 bg-transparent fs-7 d-flex align-items-center gap-2 ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <i className="bi bi-grid-1x2"></i> Dashboard Overview
          </button>
          <button
            className={`custom-nav-link border-0 bg-transparent fs-7 d-flex align-items-center gap-2 ${activeTab === 'board' ? 'active' : ''}`}
            onClick={() => setActiveTab('board')}
            disabled={!selectedProjectId}
          >
            <i className="bi bi-kanban"></i> Interactive Kanban
          </button>

        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="flex-grow-1" style={{ overflowY: 'auto' }}>
        {activeTab === 'dashboard' && (
          <Dashboard
            user={user}
            selectedProjectId={selectedProjectId}
            onProjectChange={setSelectedProjectId}
            refreshTrigger={refreshTrigger}
            triggerRefresh={triggerRefresh}
          />
        )}

        {activeTab === 'board' && (
          <KanbanBoard
            user={user}
            projectId={selectedProjectId}
            refreshTrigger={refreshTrigger}
            triggerRefresh={triggerRefresh}
          />
        )}


      </div>

      {/* Universal floating real-time Server-Sent Events Notification Banner */}
      <NotificationBanner />

      <CustomDialog
        isOpen={dialogOpen}
        title="Session Expired"
        message={dialogMessage}
        type="warning"
        onConfirm={() => setDialogOpen(false)}
      />

      {/* Responsive footer */}
      <footer className="py-3 text-center border-top fs-8 text-secondary mt-auto" style={{ background: 'rgba(10,12,16,0.95)', borderColor: 'rgba(255,255,255,0.03) !important' }}>
        NxtWave Task Tracker. SDE II.
      </footer>
    </div>
  );
};
export default App;
