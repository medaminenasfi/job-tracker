'use client';

import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-black">Job Tracker</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-sm">{user?.name ?? user?.email}</span>
          <button
            id="logout-btn"
            onClick={logout}
            className="text-sm text-black border border-black hover:bg-black hover:text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="p-6">
        <p className="text-gray-500 text-sm">
          ✅ Authenticated as <span className="text-black font-medium">{user?.email}</span>.
          Kanban board coming in Phase 3.
        </p>
      </main>
    </div>
  );
}
