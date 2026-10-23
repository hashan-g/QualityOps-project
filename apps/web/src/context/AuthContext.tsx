import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { UserResponse } from '@qualityops/contracts';

export interface AuthContextType {
  user: UserResponse | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserResponse | null>(null);
  // Security requirement: Access token is kept strictly in-memory (React state), never in localStorage/sessionStorage.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Silently refresh token on initial load using the HttpOnly cookie
  useEffect(() => {
    let isMounted = true;

    async function checkExistingSession() {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Sends HttpOnly cookie
        });

        if (res.ok) {
          const data = (await res.json()) as { accessToken: string; user: UserResponse };
          if (isMounted) {
            setAccessToken(data.accessToken);
            setUser(data.user);
          }
        }
      } catch {
        // No active session or network error; remain unauthenticated
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json()) as {
        user?: UserResponse;
        accessToken?: string;
        error?: { message: string };
      };

      if (!res.ok) {
        throw new Error(data.error?.message || 'Authentication failed');
      }

      if (data.user && data.accessToken) {
        setUser(data.user);
        setAccessToken(data.accessToken);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch {
      // Ignore network errors during logout
    } finally {
      setUser(null);
      setAccessToken(null);
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
