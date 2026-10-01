'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, setAccessToken, extractMessage, TokenScope } from '@/lib/api';
import { User } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  // User session (drives /dashboard)
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, turnstileToken?: string | null) => Promise<void>;
  register: (name: string, email: string, password: string, turnstileToken?: string | null) => Promise<void>;
  logout: (redirectTo?: string) => Promise<void>;
  // Re-fetches the current user profile (used after linking/unlinking Google or
  // setting a first password so googleConnected/hasPassword stay accurate).
  refreshUser: () => Promise<void>;
  // Admin session (drives /admin) — fully independent of the user session
  adminUser: User | null;
  adminLoading: boolean;
  adminLogin: (email: string, password: string, turnstileToken?: string | null) => Promise<void>;
  adminRegister: (name: string, email: string, password: string, token: string) => Promise<void>;
  adminLogout: (redirectTo?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const router = useRouter();

  // Restores the user session from the refreshToken cookie.
  const restoreSession = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.accessToken, 'user');
        const meRes = await apiFetch('/api/auth/me');
        if (meRes.ok) setUser(await meRes.json());
      }
    } catch {
      // No valid user session
    } finally {
      setLoading(false);
    }
  }, []);

  // Restores the admin session from the separate adminRefreshToken cookie. Runs
  // independently so an admin can be signed into /admin while a different user is
  // signed into /dashboard.
  const restoreAdminSession = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/auth/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.accessToken, 'admin');
        const meRes = await apiFetch('/api/admin/auth/me');
        if (meRes.ok) setAdminUser(await meRes.json());
      }
    } catch {
      // No valid admin session
    } finally {
      setAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
    restoreAdminSession();
  }, [restoreSession, restoreAdminSession]);

  // Re-reads the user profile so derived flags (googleConnected/hasPassword)
  // update in place after a Google link/unlink or a first-password set.
  const refreshUser = useCallback(async () => {
    try {
      const meRes = await apiFetch('/api/auth/me');
      if (meRes.ok) setUser(await meRes.json());
    } catch {
      // Session already handled elsewhere; ignore a failed refresh.
    }
  }, []);

  // Completes a successful auth response for one scope: store the access token,
  // load the profile via the scope-appropriate `me` endpoint, then route.
  const completeAuth = async (
    res: Response,
    opts: {
      scope: TokenScope;
      mePath: string;
      redirectTo: string;
      failMessage: string;
      setSessionUser: (u: User) => void;
    },
  ) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractMessage(err, opts.failMessage));
    }
    const data = await res.json();
    setAccessToken(data.accessToken, opts.scope);
    const meRes = await apiFetch(opts.mePath);
    if (!meRes.ok) throw new Error('Authenticated but failed to load profile');
    opts.setSessionUser(await meRes.json());
    router.push(opts.redirectTo);
    router.refresh();
  };

  const login = async (email: string, password: string, turnstileToken?: string | null) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, turnstileToken }),
    });
    await completeAuth(res, {
      scope: 'user',
      mePath: '/api/auth/me',
      redirectTo: '/dashboard',
      failMessage: 'Login failed',
      setSessionUser: setUser,
    });
  };

  const register = async (name: string, email: string, password: string, turnstileToken?: string | null) => {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, turnstileToken }),
    });
    await completeAuth(res, {
      scope: 'user',
      mePath: '/api/auth/me',
      redirectTo: '/dashboard',
      failMessage: 'Registration failed',
      setSessionUser: setUser,
    });
  };

  const adminLogin = async (email: string, password: string, turnstileToken?: string | null) => {
    const res = await apiFetch('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, turnstileToken }),
    });
    await completeAuth(res, {
      scope: 'admin',
      mePath: '/api/admin/auth/me',
      redirectTo: '/admin',
      failMessage: 'Admin login failed',
      setSessionUser: setAdminUser,
    });
  };

  const adminRegister = async (name: string, email: string, password: string, token: string) => {
    const res = await apiFetch('/api/admin/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, token }),
    });
    await completeAuth(res, {
      scope: 'admin',
      mePath: '/api/admin/auth/me',
      redirectTo: '/admin',
      failMessage: 'Admin registration failed',
      setSessionUser: setAdminUser,
    });
  };

  const logout = async (redirectTo = '/login') => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setAccessToken(null, 'user');
    setUser(null);
    router.push(redirectTo);
    router.refresh();
  };

  const adminLogout = async (redirectTo = '/admin/login') => {
    await apiFetch('/api/admin/auth/logout', { method: 'POST' });
    setAccessToken(null, 'admin');
    setAdminUser(null);
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        adminUser,
        adminLoading,
        adminLogin,
        adminRegister,
        adminLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
