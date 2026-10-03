'use client';

import { forwardRef } from 'react';
import { LoadingSpinner } from '@/components/ui/Loading';

// Shared button styling so <button>, <Link> and <a> all render identically.
// Compose pages from this instead of repeating accent/button class strings.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-hover shadow-sm shadow-accent/20',
  secondary:
    'bg-muted text-foreground hover:bg-muted/70 active:bg-muted border border-border',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/90 shadow-sm shadow-danger/20',
  outline:
    'border border-border bg-card text-foreground hover:bg-muted hover:border-input active:bg-muted',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
  icon: 'h-9 w-9 justify-center',
};

const BASE =
  'inline-flex select-none items-center rounded-lg font-semibold transition-[background-color,color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]';

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = '',
) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonStyles(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  );
});
