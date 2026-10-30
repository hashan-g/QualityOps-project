import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginForm: React.FC = () => {
  const { login, isLoading, error, clearError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    if (!username.trim()) {
      setValidationError('Username or email is required.');
      return;
    }

    if (!password) {
      setValidationError('Password is required.');
      return;
    }

    try {
      await login(username.trim(), password);
    } catch {
      // Error is captured and rendered via AuthContext error
    }
  };

  const displayedError = validationError || error;

  return (
    <section
      aria-labelledby="login-heading"
      className="qo-card"
      style={{
        maxWidth: '440px',
        margin: '40px auto',
        boxShadow: 'var(--qo-shadow-lg)',
        border: '1px solid var(--qo-slate-200)',
      }}
    >
      <div
        style={{
          padding: '24px 28px 16px 28px',
          borderBottom: '1px solid var(--qo-slate-100)',
          backgroundColor: 'var(--qo-slate-50)',
          borderRadius: 'var(--qo-radius-lg) var(--qo-radius-lg) 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              background: 'linear-gradient(135deg, var(--qo-navy-900) 0%, var(--qo-primary) 100%)',
              borderRadius: '6px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '14px',
            }}
          >
            Q
          </div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--qo-primary)',
            }}
          >
            QualityOps Enterprise
          </span>
        </div>
        <h2
          id="login-heading"
          style={{
            fontSize: '20px',
            fontWeight: 700,
            margin: '0 0 4px 0',
            color: 'var(--qo-navy-900)',
          }}
        >
          Sign In to QualityOps
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--qo-slate-500)' }}>
          Enter your authenticated operator or administrator credentials.
        </p>
      </div>

      <div style={{ padding: '24px 28px' }}>
        {displayedError && (
          <div
            role="alert"
            aria-live="polite"
            className="qo-alert-banner qo-alert-danger"
            style={{ marginBottom: '20px' }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }} aria-hidden="true">
              ⚠️
            </span>
            <div style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{displayedError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '18px' }}>
            <label htmlFor="login-username" className="qo-form-label">
              Username or Email
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              required
              aria-required="true"
              placeholder="e.g. admin or operator@plant.local"
              className="qo-form-control"
              style={{ fontSize: '14px' }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '5px',
              }}
            >
              <label htmlFor="login-password" className="qo-form-label" style={{ margin: 0 }}>
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '12px',
                  color: 'var(--qo-primary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {showPassword ? 'Hide Password' : 'Show Password'}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                aria-required="true"
                placeholder="Enter password"
                className="qo-form-control"
                style={{ fontSize: '14px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="qo-btn qo-btn-primary"
            style={{
              width: '100%',
              padding: '11px 16px',
              fontSize: '14px',
              fontWeight: 600,
              boxShadow: 'var(--qo-shadow-xs)',
            }}
          >
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div
          style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--qo-slate-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--qo-slate-500)',
          }}
        >
          <span style={{ fontSize: '14px' }}>🔒</span>
          <span>Argon2id Verification &bull; In-Memory Access Token</span>
        </div>
      </div>
    </section>
  );
};

export default LoginForm;
