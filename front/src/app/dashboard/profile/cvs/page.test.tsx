import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CvsPage from './page';

const { apiJsonMock, apiFetchMock } = vi.hoisted(() => ({
  apiJsonMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  downloadApiFile: vi.fn(),
  extractMessage: (payload: unknown, fallback: string) =>
    (payload as { message?: string })?.message ?? fallback,
}));

const UPLOADED = {
  id: 'cv1',
  label: 'Uploaded CV',
  source: 'uploaded',
  is_default: true,
  created_at: '2026-10-01T00:00:00Z',
  text_length: 1200,
  parse_status: 'partial',
  parse_method: 'rule_based',
  structured_data: { skills: ['Go'], experience: [], education: [] },
};

const GENERATED = {
  id: 'g1',
  label: 'Classic — generated CV',
  source: 'built',
  is_default: false,
  created_at: '2026-10-04T00:00:00Z',
  parse_status: 'parsed',
  parse_method: null,
  structured_data: {
    skills: ['TypeScript'],
    experience: [{ text: 'Engineer, ACME' }],
    education: [],
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CvsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiJsonMock.mockReset();
  apiFetchMock.mockReset();
  apiJsonMock.mockImplementation((path: string) => {
    if (path === '/api/cvs') return Promise.resolve([UPLOADED, GENERATED]);
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
});

describe('CvsPage', () => {
  it('lists uploaded and generated CVs in one list', async () => {
    renderPage();

    expect(await screen.findByText('Uploaded CV')).toBeTruthy();
    expect(screen.getByText('Classic — generated CV')).toBeTruthy();
    // The generated one is labelled as such, not as a raw source string.
    expect(screen.getByText('Built from template')).toBeTruthy();
    expect(screen.getByText(/^Generated · /)).toBeTruthy();
    expect(screen.getByText(/^Uploaded · 1,200 chars extracted/)).toBeTruthy();
  });

  it('offers AI parsing for an uploaded CV but not for a generated one', async () => {
    renderPage();
    await screen.findByText('Uploaded CV');

    fireEvent.click(
      screen.getByRole('button', { name: 'Show parsed data for Classic — generated CV' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Try AI Parsing' }),
    ).toBeNull();
    expect(
      screen.getByText(/Generated from a template/),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show parsed data for Uploaded CV' }),
    );
    expect(screen.getByRole('button', { name: 'Try AI Parsing' })).toBeTruthy();
  });

  it('offers a free rule-based re-parse next to the AI one', async () => {
    renderPage();
    await screen.findByText('Uploaded CV');

    fireEvent.click(
      screen.getByRole('button', { name: 'Show parsed data for Uploaded CV' }),
    );

    const button = screen.getByRole('button', { name: 'Re-parse' });
    expect(button).toBeTruthy();

    apiJsonMock.mockResolvedValueOnce({ ...UPLOADED, parse_status: 'parsed' });
    fireEvent.click(button);

    await waitFor(() =>
      expect(apiJsonMock).toHaveBeenCalledWith(
        '/api/cvs/cv1/parse?method=rule',
        { method: 'POST' },
      ),
    );
  });

  // The label is optional and the server derives one. Requiring it here would
  // push work back at the user for something the file already contains.
  it('lets the user upload without naming the CV', async () => {
    renderPage();
    await screen.findByText('Uploaded CV');

    const button = screen.getByRole('button', { name: 'Upload CV' }) as HTMLButtonElement;
    // Nothing chosen yet.
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/File \(PDF or DOCX/), {
      target: {
        files: [new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' })],
      },
    });

    // A file alone is enough; the label field stays optional.
    expect(button.disabled).toBe(false);
    expect(screen.getByLabelText('Label (optional)')).toBeTruthy();
  });

  it('states why the upload button is disabled before a file is chosen', async () => {
    renderPage();
    await screen.findByText('Uploaded CV');

    expect(
      screen.getByText('Choose a PDF or DOCX file to upload.'),
    ).toBeTruthy();
  });

  it('explains that an empty label is filled in automatically', async () => {
    renderPage();
    await screen.findByText('Uploaded CV');

    expect(
      screen.getByText(/we'll name it after the name and headline found in the file/),
    ).toBeTruthy();
  });
});