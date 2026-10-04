import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminCvTemplatesPage from './page';

const { apiJsonMock } = vi.hoisted(() => ({ apiJsonMock: vi.fn() }));

vi.mock('@/lib/api', () => ({
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
}));

const TEMPLATE = {
  id: 't1',
  name: 'Classic',
  description: 'Single column',
  language: 'en',
  is_active: true,
  created_at: '2026-10-01T00:00:00Z',
  latex_length: 240,
};

const PLACEHOLDERS = {
  placeholders: [
    { name: 'fullName', token: '{{fullName}}' },
    { name: 'skills', token: '{{skills}}' },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminCvTemplatesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiJsonMock.mockReset();
  apiJsonMock.mockImplementation((path: string) => {
    if (path.startsWith('/api/admin/cv-templates/placeholders')) return Promise.resolve(PLACEHOLDERS);
    if (path.startsWith('/api/admin/cv-templates?')) return Promise.resolve([TEMPLATE]);
    return Promise.resolve(TEMPLATE);
  });
});

describe('AdminCvTemplatesPage', () => {
  it('lists templates and offers the allowed placeholders', async () => {
    renderPage();

    expect(await screen.findByText('Classic')).toBeTruthy();
    expect(apiJsonMock).toHaveBeenCalledWith(
      '/api/admin/cv-templates?include_inactive=true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    expect(await screen.findByRole('button', { name: '{{fullName}}' })).toBeTruthy();
  });

  it('creates a template from the editor', async () => {
    renderPage();
    await screen.findByText('Classic');

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Modern' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    await waitFor(() =>
      expect(apiJsonMock).toHaveBeenCalledWith('/api/admin/cv-templates', {
        method: 'POST',
        body: expect.stringContaining('"name":"Modern"'),
      }),
    );
  });

  it('previews the template with sample data', async () => {
    apiJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/admin/cv-templates/placeholders')) return Promise.resolve(PLACEHOLDERS);
      if (path.startsWith('/api/admin/cv-templates?')) return Promise.resolve([TEMPLATE]);
      if (path === '/api/admin/cv-templates/preview')
        return Promise.resolve({ placeholders: ['fullName'], latex: 'Ada Lovelace' });
      return Promise.resolve(TEMPLATE);
    });
    renderPage();
    await screen.findByText('Classic');

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview with sample data' }));

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(apiJsonMock).toHaveBeenCalledWith('/api/admin/cv-templates/preview', {
      method: 'POST',
      body: expect.stringContaining('latex_source'),
    });
  });

  it('surfaces a backend rejection as a toast', async () => {
    apiJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/admin/cv-templates/placeholders')) return Promise.resolve(PLACEHOLDERS);
      if (path.startsWith('/api/admin/cv-templates?')) return Promise.resolve([TEMPLATE]);
      if (path === '/api/admin/cv-templates/t1/status') return Promise.resolve(TEMPLATE);
      return Promise.reject(new Error('Template uses forbidden LaTeX primitive \\input'));
    });
    renderPage();
    await screen.findByText('Classic');

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(
      await screen.findByText('Template uses forbidden LaTeX primitive \\input'),
    ).toBeTruthy();
  });

  it('shows the load failure instead of an empty table', async () => {
    apiJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/admin/cv-templates/placeholders')) return Promise.resolve(PLACEHOLDERS);
      return Promise.reject(new Error('Admin access required'));
    });
    renderPage();

    expect(await screen.findByText(/Failed to load templates/)).toBeTruthy();
  });
});
