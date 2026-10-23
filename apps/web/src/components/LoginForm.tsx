import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginForm: React.FC = () => {
  const { login, isLoading, error, clearError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '400px',
        margin: '0 auto',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <h2
        id="login-heading"
        style={{ fontSize: '20px', marginTop: 0, marginBottom: '16px', color: '#2d3748' }}
      >
        Sign In
      </h2>

      {displayedError && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            backgroundColor: '#fff5f5',
            color: '#c53030',
            border: '1px solid #feb2b2',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {displayedError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="login-username"
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '6px',
              color: '#4a5568',
            }}
          >
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
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            htmlFor="login-password"
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '6px',
              color: '#4a5568',
            }}
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
            aria-required="true"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            backgroundColor: isLoading ? '#a0aec0' : '#3182ce',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 16px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          {isLoading ? 'Authenticating...' : 'Sign In'}
        </button>
      </form>
    </section>
  );
};
