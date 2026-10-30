import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { AuthenticatedView } from './components/AuthenticatedView';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="qo-app-wrapper">
      {/* Enterprise Application Header */}
      <header className="qo-header">
        <div className="qo-container qo-header-content">
          <div className="qo-brand-area">
            <div className="qo-brand-icon" aria-hidden="true">
              Q
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 className="qo-brand-title" style={{ fontSize: '18px', margin: 0 }}>
                  QualityOps Platform
                </h1>
                <span
                  className="qo-badge qo-badge-medium"
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 700,
                  }}
                >
                  Phase 12: Notification Engine &amp; Email Delivery
                </span>
                <span
                  className="qo-badge qo-badge-success"
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 700,
                  }}
                >
                  PostgreSQL 18
                </span>
              </div>
              <p
                className="qo-brand-subtitle"
                style={{ fontSize: '12px', margin: 0, color: 'var(--qo-slate-500)' }}
              >
                Manufacturing Quality &amp; Process Analytics Platform &mdash; Defect Findings,
                Descriptive Analytics, Inspections &amp; Production Batches
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: '24px 0 48px 0',
        }}
      >
        <div className="qo-container">
          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="qo-card"
              style={{
                textAlign: 'center',
                padding: '64px 24px',
                color: 'var(--qo-slate-500)',
                maxWidth: '480px',
                margin: '40px auto',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  border: '3px solid var(--qo-slate-200)',
                  borderTopColor: 'var(--qo-primary)',
                  borderRadius: '50%',
                  animation: 'qo-spin 0.8s linear infinite',
                  margin: '0 auto 16px auto',
                }}
              />
              <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--qo-navy-900)' }}>
                Verifying session status...
              </div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>
                Connecting to PostgreSQL 18 &amp; validating security tokens
              </div>
            </div>
          ) : isAuthenticated ? (
            <AuthenticatedView />
          ) : (
            <LoginForm />
          )}
        </div>
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--qo-slate-200)',
          backgroundColor: 'var(--qo-white)',
          padding: '16px 0',
          fontSize: '12px',
          color: 'var(--qo-slate-500)',
        }}
      >
        <div
          className="qo-container"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div>
            &copy; {new Date().getFullYear()} QualityOps &bull; Enterprise Manufacturing Quality
            &amp; Process Analytics
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>SOC 2 Type II Compliant Invariant</span>
            <span>Argon2id + HTTP-Only Session Security</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
