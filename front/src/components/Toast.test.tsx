import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('announces success messages politely and auto-dismisses them', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    render(<Toast message="Job saved" type="success" onClose={onClose} />);

    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Job saved');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses an assertive alert role for errors', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    render(<Toast message="Failed to update status" type="error" onClose={onClose} />);

    const toast = screen.getByRole('alert');
    expect(toast.textContent).toContain('Failed to update status');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
