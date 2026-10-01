'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/jobs', label: 'Jobs', icon: '📋' },
  { href: '/admin/audit-logs', label: 'Audit Log', icon: '🛡️' },
];

// Deliberately dark-themed so an admin never confuses this area with the
// light user app sidebar.
export function AdminSidebar() {
  const pathname = usePathname();
  const { adminUser, adminLogout } = useAuth();

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 h-screen flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white">Job Tracker</h1>
        <span className="inline-block mt-2 px-2 py-0.5 text-xs font-semibold rounded bg-indigo-500 text-white">
          ADMIN
        </span>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive =
              item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="mb-3 px-4">
          <p className="text-sm font-medium text-white truncate">{adminUser?.name}</p>
          <p className="text-xs text-slate-400 truncate">{adminUser?.email}</p>
        </div>
        <Link
          href="/dashboard"
          className="w-full flex items-center gap-2 px-4 py-2 mb-1 text-sm text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <span>←</span>
          <span>User app</span>
        </Link>
        <button
          onClick={() => adminLogout('/admin/login')}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <span>🚪</span>
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
