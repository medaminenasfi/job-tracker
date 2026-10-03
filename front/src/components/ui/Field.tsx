'use client';

import { forwardRef, useId } from 'react';

// Form primitives: consistent input/textarea/label styling with focus, error
// and disabled states. Reused across profile, settings, auth and job forms so
// no page reinvents input classes.

const CONTROL =
  'w-full rounded-lg border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60';

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className = '', invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${CONTROL} h-10 ${
        invalid ? 'border-danger focus:border-danger' : 'border-input focus:border-accent'
      } ${className}`}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className = '', invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${CONTROL} min-h-[88px] py-2 ${
        invalid ? 'border-danger focus:border-danger' : 'border-input focus:border-accent'
      } ${className}`}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className = '', invalid, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${CONTROL} h-10 appearance-none pr-8 ${
        invalid ? 'border-danger' : 'border-input focus:border-accent'
      } ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Label({
  htmlFor,
  children,
  className = '',
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground ${className}`}
    >
      {children}
    </label>
  );
}

/** Label + control + optional hint/error, wired with matching ids. */
export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
