'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, setAccessToken } from '@/lib/api';
import { User } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) return String(message[0] ?? fallback);
    if (typeof message === 'string') return message;
  }
  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const restoreSession = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.accessToken);
        const meRes = await apiFetch('/api/auth/me');
        if (meRes.ok) setUser(await meRes.json());
      }
    } catch {
      // No valid session
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(errorMessage(err, 'Login failed'));
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    const meRes = await apiFetch('/api/auth/me');
    if (!meRes.ok) throw new Error('Logged in but failed to load profile');
    setUser(await meRes.json());
    router.push('/dashboard');
    router.refresh();
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(errorMessage(err, 'Registration failed'));
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    const meRes = await apiFetch('/api/auth/me');
    if (!meRes.ok) throw new Error('Registered but failed to load profile');
    setUser(await meRes.json());
    router.push('/dashboard');
    router.refresh();
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setAccessToken(null);
    setUser(null);
    router.push('/login');
    router.refresh();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
