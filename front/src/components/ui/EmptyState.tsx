import { ComponentType, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// Shared empty + error states so every page communicates "nothing here" and
// "something went wrong" the same way, in both themes.

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center ${className}`}
    >
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
      )}
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
}: {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center rounded-xl border border-danger/25 bg-danger/5 px-6 py-12 text-center ${className}`}
    >
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {message && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-5">
          Try again
        </Button>
      )}
    </div>
  );
}
