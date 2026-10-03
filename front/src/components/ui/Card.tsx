import { ReactNode } from 'react';

// Card primitives — the one card style shared by every dashboard/admin page.
// Compose with CardHeader/CardTitle/CardContent instead of repeating
// `bg-card border border-border rounded-lg shadow-card` inline.

export function Card({
  children,
  className = '',
  hover = false,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Subtle lift + border accent on hover (interactive cards). */
  hover?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <As
      className={`rounded-xl border border-border bg-card shadow-card transition-[box-shadow,border-color,transform] duration-200 ${
        hover ? 'hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover' : ''
      } ${className}`}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>{children}</div>
  );
}

export function CardTitle({
  children,
  className = '',
  icon,
}: {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <h2 className={`flex items-center gap-2 text-base font-bold tracking-tight text-foreground ${className}`}>
      {icon}
      {children}
    </h2>
  );
}

export function CardDescription({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`text-xs text-muted-foreground ${className}`}>{children}</p>;
}

export function CardContent({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
