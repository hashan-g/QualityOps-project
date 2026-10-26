import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { AuthenticatedView } from './components/AuthenticatedView';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: '850px',
        margin: '40px auto',
        padding: '24px',
        color: '#1a202c',
        lineHeight: 1.5,
      }}
    >
      <header
        style={{
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '16px',
          marginBottom: '28px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <span
            style={{
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: 700,
              color: '#2b6cb0',
              backgroundColor: '#ebf8ff',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            Phase 9: Advanced Analytics &amp; SPC
          </span>
          <span
            style={{
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: 700,
              color: '#276749',
              backgroundColor: '#f0fff4',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            PostgreSQL 18
          </span>
        </div>
        <h1 style={{ fontSize: '28px', marginTop: '8px', marginBottom: '8px' }}>
          QualityOps Platform
        </h1>
        <p style={{ color: '#718096', margin: 0 }}>
          Manufacturing Quality & Process Analytics Platform &mdash; Defect Findings, Descriptive
          Analytics, Inspections & Production Batches
        </p>
      </header>

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            textAlign: 'center',
            padding: '48px',
            color: '#718096',
            fontSize: '15px',
          }}
        >
          Verifying session status...
        </div>
      ) : isAuthenticated ? (
        <AuthenticatedView />
      ) : (
        <LoginForm />
      )}
    </main>
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
