import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, buttonStyles } from './Button';
import { Badge, StatusBadge } from './Badge';
import { StatCard } from './StatCard';
import { Alert } from './Alert';
import { EmptyState, ErrorState } from './EmptyState';
import { Field, Input } from './Field';
import { statusStyle } from '@/lib/statusStyles';

// jsdom has no matchMedia; stub it so useCountUp snaps straight to the target
// instead of animating from 0 (keeps StatCard assertions deterministic).
function stubReducedMotion(matches = true) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('statusStyle', () => {
  it('maps a known status to its semantic palette (case-insensitive)', () => {
    expect(statusStyle('applied').bar).toBe('bg-warning');
    expect(statusStyle('OFFER').bar).toBe('bg-success');
    expect(statusStyle('Rejected').dot).toBe('bg-danger');
  });

  it('falls back to a neutral style for unknown/custom statuses', () => {
    const neutral = statusStyle('SomeCustomStage');
    expect(neutral.bar).toBe('bg-muted-foreground/50');
    expect(statusStyle(null).badge).toBe(neutral.badge);
    expect(statusStyle(undefined).badge).toBe(neutral.badge);
  });
});

describe('Button', () => {
  it('renders children and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables and marks busy while loading, without firing onClick', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies variant classes through buttonStyles', () => {
    expect(buttonStyles('danger')).toContain('bg-danger');
    expect(buttonStyles('outline')).toContain('border-border');
    expect(buttonStyles('primary', 'sm')).toContain('h-8');
  });
});

describe('StatusBadge', () => {
  it('title-cases the status label and applies its color', () => {
    render(<StatusBadge status="interview" />);
    const badge = screen.getByText('Interview');
    expect(badge).toBeTruthy();
    // The pill inherits the shared accent palette for INTERVIEW.
    expect(badge.className).toContain('text-accent');
  });

  it('renders a plain Badge with custom classes', () => {
    render(<Badge className="bg-muted text-muted-foreground">Applied 3</Badge>);
    expect(screen.getByText('Applied 3')).toBeTruthy();
  });
});

describe('StatCard', () => {
  it('shows the label, the snapped value and a suffix', () => {
    stubReducedMotion(true);
    render(<StatCard value={42} suffix="%" label="Response rate" />);
    expect(screen.getByText('Response rate')).toBeTruthy();
    expect(screen.getByTestId('stat-value').textContent).toBe('42%');
  });

  it('renders zero without a suffix as just the number', () => {
    stubReducedMotion(true);
    render(<StatCard value={0} label="Total jobs" />);
    expect(screen.getByTestId('stat-value').textContent).toBe('0');
  });
});

describe('Alert', () => {
  it('uses role=alert for error and warning tones', () => {
    const { rerender } = render(<Alert tone="error">Boom</Alert>);
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(<Alert tone="warning">Careful</Alert>);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('uses role=status for success and info tones', () => {
    render(<Alert tone="success">Saved</Alert>);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});

describe('EmptyState / ErrorState', () => {
  it('renders an empty state with title, description and action', () => {
    render(
      <EmptyState title="No jobs yet" description="Add one to start." action={<button>Add</button>} />,
    );
    expect(screen.getByText('No jobs yet')).toBeTruthy();
    expect(screen.getByText('Add one to start.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('renders an error state and calls onRetry', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Failed" message="Try again." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when no handler is given', () => {
    render(<ErrorState title="Failed" />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('Field', () => {
  it('wires the label to the control id', () => {
    render(
      <Field label="Headline">
        {(id) => <Input id={id} placeholder="e.g. Developer" />}
      </Field>,
    );
    // getByLabelText only resolves when label[for] === input[id].
    expect(screen.getByLabelText('Headline')).toBeTruthy();
  });

  it('shows an error message with role=alert instead of the hint', () => {
    render(
      <Field label="Email" hint="Optional" error="Invalid email">
        {(id) => <Input id={id} />}
      </Field>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Invalid email');
    expect(screen.queryByText('Optional')).toBeNull();
  });

  it('shows the hint when there is no error', () => {
    render(
      <Field label="Bio" hint="0/2000">
        {(id) => <Input id={id} />}
      </Field>,
    );
    expect(screen.getByText('0/2000')).toBeTruthy();
  });
});
