import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobDetailsModal } from './JobDetailsModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { onCloseMock } = vi.hoisted(() => ({
  onCloseMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
  apiJson: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/useJobStatuses', () => ({
  useJobStatuses: () => ({ data: [] }),
  statusLabel: (s: string) => s,
  DEFAULT_STATUS_NAMES: ['SAVED'],
}));

const job = {
  id: 'j1',
  user_id: 'u1',
  title: 'Frontend Developer',
  company: 'Acme',
  status: 'SAVED',
};

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <JobDetailsModal job={job as never} isOpen onClose={onCloseMock} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  onCloseMock.mockClear();
});

describe('JobDetailsModal', () => {
  it('renders the job title, company and dialog semantics', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Frontend Developer')).toBeTruthy();
    expect(screen.getByText(/Acme/)).toBeTruthy();
  });

  it('closes with the X button', () => {
    renderModal();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close job details' }));
    });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape', () => {
    renderModal();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('renders through a portal directly into document.body', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.closest('[data-testid="job-details-backdrop"]')).toBeTruthy();
  });

  it('closes when clicking the backdrop but not the dialog', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    act(() => {
      fireEvent.click(dialog);
    });
    expect(onCloseMock).not.toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByTestId('job-details-backdrop'));
    });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the header and footer fixed while only the content area scrolls', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    const header = dialog.querySelector('header');
    const footer = dialog.querySelector('footer');
    expect(header?.className).toContain('shrink-0');
    expect(footer?.className).toContain('shrink-0');
    expect(header?.className).toContain('border-b');
    expect(footer?.className).toContain('border-t');

    const content = header?.nextElementSibling;
    expect(content?.className).toContain('flex-1');
    expect(content?.className).toContain('min-h-0');
    expect(content?.className).toContain('overflow-y-auto');
  });

  it('locks body scrolling while open and restores it on close', () => {
    const { unmount } = renderModal();
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
