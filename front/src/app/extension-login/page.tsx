'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken, apiFetch } from '@/lib/api';

const BRIDGE_SOURCE = 'jobtracker-bridge';

type Status = 'working' | 'connected' | 'no-extension';

export default function ExtensionLoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('working');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    const sendToken = async () => {
      let token = getAccessToken();
      if (!token) {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) token = getAccessToken();
      }
      if (!token) {
        router.replace('/login');
        return;
      }
      window.postMessage({ source: BRIDGE_SOURCE, type: 'SET_TOKEN', token }, window.location.origin);
    };

    const onAck = (event: MessageEvent) => {
      if (
        event.source === window &&
        event.origin === window.location.origin &&
        event.data?.source === BRIDGE_SOURCE &&
        event.data?.type === 'TOKEN_SAVED'
      ) {
        if (!cancelled) setStatus('connected');
      }
    };

    window.addEventListener('message', onAck);
    sendToken();
    // If the extension content script never acks, show manual instructions.
    const timeout = setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === 'working' ? 'no-extension' : s));
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      window.removeEventListener('message', onAck);
    };
  }, [loading, user, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-black">Connect the extension</h1>
        {status === 'working' && (
          <p className="mt-3 text-sm text-gray-500">Sending your session to the Job Tracker extension…</p>
        )}
        {status === 'connected' && (
          <>
            <p className="mt-3 text-sm text-green-600">
              Extension connected. You can now save jobs from any page.
            </p>
            <a href="/dashboard/jobs" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
              Go to dashboard
            </a>
          </>
        )}
        {status === 'no-extension' && (
          <p className="mt-3 text-sm text-gray-500">
            Extension not detected. Make sure it is installed and loaded, then reload this page.
          </p>
        )}
      </div>
    </main>
  );
}
