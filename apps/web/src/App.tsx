import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { AuthenticatedView } from './components/AuthenticatedView';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isAuthenticated) {
    return <AuthenticatedView />;
  }

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
              </div>
              <p
                className="qo-brand-subtitle"
                style={{ fontSize: '12.5px', margin: 0, color: 'var(--qo-slate-500)' }}
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
          padding: '40px 0 60px 0',
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
                padding: '48px 32px',
                maxWidth: '440px',
                margin: '20px auto',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  border: '3px solid var(--qo-slate-200)',
                  borderTopColor: 'var(--qo-primary)',
                  borderRadius: '50%',
                  animation: 'qo-spin 0.8s linear infinite',
                  margin: '0 auto 16px auto',
                }}
              />
              <h2
                style={{
                  fontWeight: 600,
                  fontSize: '16px',
                  color: 'var(--qo-navy-900)',
                  margin: 0,
                }}
              >
                Verifying session status...
              </h2>
              <p
                style={{
                  fontSize: '13.5px',
                  color: 'var(--qo-slate-500)',
                  marginTop: '6px',
                  marginBottom: 0,
                }}
              >
                Connecting to services &amp; validating security tokens
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: '480px', margin: '0 auto' }}>
              <LoginForm />
            </div>
          )}
        </div>
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--qo-slate-200)',
          backgroundColor: 'var(--qo-white)',
          padding: '16px 0',
          fontSize: '12.5px',
          color: 'var(--qo-slate-500)',
        }}
      >
        <div
          className="qo-container"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            &copy; {new Date().getFullYear()} QualityOps | Manufacturing Quality &amp; Process
            Analytics
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>Protected with Argon2id</span>
            <span>Secure Session Token Handling</span>
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
