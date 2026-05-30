import React, { useState } from 'react';
import { api } from '../services/api';
import { CustomDialog } from './CustomDialog';

interface AuthProps {
  onAuthSuccess: (user: any) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [role, setRole] = useState('MEMBER');
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const res = await api.auth.login({ email, password });
        localStorage.setItem('accessToken', res.data.accessToken);
        localStorage.setItem('refreshToken', res.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        onAuthSuccess(res.data.user);
      } else {
        await api.auth.register({ email, password, name, organizationName, role });
        setError(null);
        setDialogMessage('Registration successful! Please login with your credentials.');
        setDialogOpen(true);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <div className="row justify-content-center w-100">
        <div className="col-12 col-md-8 col-lg-5">
          <div className="glass-panel p-5">
            <div className="text-center mb-4">
              <h2 className="glow-text-cyan fw-bold">NxtWave Tracker</h2>
              <p className="text-secondary">{isLogin ? 'Sign in to access your dashboard' : 'Create your workspace account'}</p>
            </div>

            {error && (
              <div className="alert alert-danger border-0 bg-danger-subtle text-danger p-3 mb-4 rounded-3 d-flex align-items-center">
                <i className="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
                <div>{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {!isLogin && (
                <>
                  <div className="mb-3">
                    <label className="form-label text-secondary fs-7">Full Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-secondary fs-7">Organization Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Acme Corporation"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-secondary fs-7">Requested Role</label>
                    <select
                      className="form-select"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="MEMBER">MEMBER (View & edit assigned tasks)</option>
                      <option value="MANAGER">MANAGER (Create & assign projects/tasks)</option>
                      <option value="ADMIN">ADMIN (Full management permission)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="mb-3">
                <label className="form-label text-secondary fs-7">Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="name@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="mb-4">
                <label className="form-label text-secondary fs-7">Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className={`btn ${isLogin ? 'btn-glow-cyan' : 'btn-glow-purple'} w-100 py-2.5 mb-3`}
                disabled={loading}
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                ) : null}
                {isLogin ? 'Sign In' : 'Register Account'}
              </button>

              <div className="text-center fs-7 text-secondary mt-3">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}
                <button
                  type="button"
                  className="btn btn-link text-decoration-none p-0 ms-1 text-cyan fw-bold fs-7 shadow-none"
                  style={{ border: 'none', background: 'none' }}
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError(null);
                  }}
                >
                  {isLogin ? 'Register now' : 'Sign in instead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <CustomDialog
        isOpen={dialogOpen}
        title="Registration Successful"
        message={dialogMessage}
        type="success"
        onConfirm={() => {
          setDialogOpen(false);
          setIsLogin(true);
        }}
      />
    </div>
  );
};
