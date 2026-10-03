import { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

// Shared inline alert banner for form feedback and page-level notices.
// Replaces the per-page hardcoded green/red/amber boxes so success, error,
// warning and info messages look identical everywhere and theme in light/dark
// via semantic tokens.

export type AlertTone = 'success' | 'error' | 'warning' | 'info';

const TONES: Record<
  AlertTone,
  { wrap: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    wrap: 'border-success/25 bg-success/5 text-success',
    icon: 'text-success',
    Icon: CheckCircle2,
  },
  error: {
    wrap: 'border-danger/25 bg-danger/5 text-danger',
    icon: 'text-danger',
    Icon: XCircle,
  },
  warning: {
    wrap: 'border-warning/25 bg-warning/5 text-warning',
    icon: 'text-warning',
    Icon: AlertTriangle,
  },
  info: {
    wrap: 'border-info/25 bg-info/5 text-info',
    icon: 'text-info',
    Icon: Info,
  },
};

export function Alert({
  tone = 'info',
  children,
  className = '',
  role,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
  /** Defaults to "status" for success/info and "alert" for error/warning. */
  role?: 'status' | 'alert';
}) {
  const { wrap, icon, Icon } = TONES[tone];
  const resolvedRole = role ?? (tone === 'error' || tone === 'warning' ? 'alert' : 'status');
  return (
    <div
      role={resolvedRole}
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${wrap} ${className}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
