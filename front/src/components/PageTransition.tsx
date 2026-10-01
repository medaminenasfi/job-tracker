'use client';

import { usePathname } from 'next/navigation';

// Phase 11.3 — short fade/slide-up whenever the route changes (150–250ms).
// The key makes React remount the subtree on navigation so the animation plays
// once per page instead of on every re-render.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in-up">
      {children}
    </div>
  );
}
