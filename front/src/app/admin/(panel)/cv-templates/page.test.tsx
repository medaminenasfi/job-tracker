import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminCvTemplatesPage from './page';
import { EXAMPLE_CV_TEMPLATE } from '@/lib/cvTemplateExample';

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

// Source the editor opens with by default: documented placeholders only, so the
// activation checklist starts from a clean slate.
const VALID_SOURCE = '\\documentclass[11pt]{article}\n{{fullName}}\n\\end{document}\n';

const PLACEHOLDERS = {
  placeholders: [
    {
      name: 'fullName',
      token: '{{fullName}}',
      label: 'Full name',
      hint: 'As it should appear at the top of the CV',
      multiline: false,
    },
    {
      name: 'experience',
      token: '{{experience}}',
      label: 'Experience',
      hint: 'One entry per line',
      multiline: true,
    },
  ],
};

// Shape returned by POST /api/admin/cv-templates/preview (Phase 6: it now also
// carries the sandbox-rendered image). The live pane consumes this on every
// debounced edit, so the default mock must return the full shape.
const PREVIEW = {
  placeholders: ['fullName'],
  latex: 'Ada Lovelace',
  image: 'data:image/png;base64,ADMINPREVIEW',
  error: null as string | null,
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
    // The live pane auto-fires ~700ms after the editor opens, and its onResult
    // feeds preview.placeholders.length in the rendered-source block — so the
    // default mock must return the full preview shape, not a bare template.
    if (path === '/api/admin/cv-templates/preview') return Promise.resolve(PREVIEW);
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

  it('documents each field with its label, hint and multi-line badge', async () => {
    renderPage();
    await screen.findByText('Classic');
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    expect(await screen.findByText('Available fields')).toBeTruthy();
    expect(screen.getByText('Full name')).toBeTruthy();
    expect(
      screen.getByText('As it should appear at the top of the CV'),
    ).toBeTruthy();
    // The experience field is flagged multi-line; fullName is not.
    expect(screen.getByText('multi-line')).toBeTruthy();
  });

  it('starts a new template from the shipped example and can re-insert it', async () => {
    renderPage();
    await screen.findByText('Classic');
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    const editor = (await screen.findByLabelText('LaTeX source')) as HTMLTextAreaElement;
    expect(editor.value).toBe(EXAMPLE_CV_TEMPLATE);

    fireEvent.change(editor, { target: { value: '\\documentclass{article}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert example' }));
    expect(
      (screen.getByLabelText('LaTeX source') as HTMLTextAreaElement).value,
    ).toBe(EXAMPLE_CV_TEMPLATE);
  });

  it('inserts a field token at the cursor when clicked', async () => {
    renderPage();
    await screen.findByText('Classic');
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    const editor = (await screen.findByLabelText('LaTeX source')) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '{{experience}}' }));
    expect(
      (screen.getByLabelText('LaTeX source') as HTMLTextAreaElement).value,
    ).toContain('{{experience}}');
  });

  it('creates a template from the editor', async () => {
    renderPage();
    await screen.findByText('Classic');

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Modern' },
    });
    // The bundled default uses only documented placeholders.
    fireEvent.change(screen.getByLabelText('LaTeX source'), {
      target: { value: VALID_SOURCE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    await waitFor(() =>
      expect(apiJsonMock).toHaveBeenCalledWith('/api/admin/cv-templates', {
        method: 'POST',
        body: expect.stringContaining('"name":"Modern"'),
      }),
    );
  });

  it('renders a live sandbox preview as the editor opens', async () => {
    renderPage();
    await screen.findByText('Classic');

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    // No button to click: the shared pane debounces ~700ms, POSTs the LaTeX
    // source, and shows the returned PNG plus the merged source text.
    expect(
      await screen.findByRole('img', { name: 'Rendered CV preview' }, { timeout: 2000 }),
    ).toBeTruthy();
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(apiJsonMock).toHaveBeenCalledWith(
      '/api/admin/cv-templates/preview',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('latex_source'),
      }),
    );
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

  // ---- Activation checklist ----

  /** Opens the editor and waits for the debounced preview to settle. */
  async function openEditor() {
    renderPage();
    await screen.findByText('Classic');
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Modern' } });
    fireEvent.change(screen.getByLabelText('LaTeX source'), {
      target: { value: VALID_SOURCE },
    });
    return screen.findByLabelText('LaTeX source');
  }

  it('lists the pre-activation requirements', async () => {
    await openEditor();

    expect(await screen.findByText('Has a name')).toBeTruthy();
    expect(screen.getByText('Uses only documented placeholders')).toBeTruthy();
    // The compile requirement flips to satisfied once the debounced preview
    // lands; wait for it rather than racing the 700ms timer.
    await waitFor(() => expect(screen.getByText('Preview compiles')).toBeTruthy(), {
      timeout: 2000,
    });
    expect(
      screen.queryByText('Save a preview that compiles before activating.'),
    ).toBeNull();
  });

  it('says a preview is still needed before anything compiles', async () => {
    await openEditor();

    expect(
      await screen.findByText('Save a preview that compiles before activating.'),
    ).toBeTruthy();
  });

  it('confirms the preview once it has compiled', async () => {
    await openEditor();

    await waitFor(
      () => expect(screen.queryByText(/before activating/)).toBeNull(),
      { timeout: 2000 },
    );
    expect(screen.getByText('Preview compiles')).toBeTruthy();
  });

  // An edit after a successful compile invalidates the check: the previous
  // render said nothing about the current source.
  it('requires a fresh preview after the source is edited', async () => {
    const editor = await openEditor();
    await waitFor(
      () => expect(screen.queryByText(/before activating/)).toBeNull(),
      { timeout: 2000 },
    );

    fireEvent.change(editor, { target: { value: `${VALID_SOURCE}\\mypkg` } });

    expect(
      await screen.findByText('Save a preview that compiles before activating.'),
    ).toBeTruthy();
  });

  // The useful detail: which token, not just "invalid placeholders".
  it('names the undocumented placeholder blocking activation', async () => {
    const editor = await openEditor();
    fireEvent.change(editor, {
      target: { value: '\\documentclass{article}\n{{fullName}}\n{{projects}}\n' },
    });

    expect(
      await screen.findByText(
        'Replace the undocumented placeholder: {{projects}}.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Uses only documented placeholders')).toBeNull();
  });

  it('reports a missing name as a rename instruction', async () => {
    renderPage();
    await screen.findByText('Classic');
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    expect(
      await screen.findByText('Give it a name users will recognise in the gallery.'),
    ).toBeTruthy();
    expect(screen.queryByText('Has a name')).toBeNull();
  });

  // ---- Compile error markers ----

  it('points at the failing line the compiler named', async () => {
    apiJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/admin/cv-templates/placeholders')) return Promise.resolve(PLACEHOLDERS);
      if (path.startsWith('/api/admin/cv-templates?')) return Promise.resolve([TEMPLATE]);
      if (path === '/api/admin/cv-templates/preview') {
        return Promise.resolve({
          ...PREVIEW,
          image: null,
          error: 'Unknown LaTeX command.',
          latexError: { line: 2, message: 'Unknown LaTeX command.' },
        });
      }
      return Promise.resolve(TEMPLATE);
    });

    await openEditor();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      await screen.findByText(/Line 2: Unknown LaTeX command\./),
    ).toBeTruthy();
  });

  it('reports the message without a line when the compiler named none', async () => {
    apiJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/admin/cv-templates/placeholders')) return Promise.resolve(PLACEHOLDERS);
      if (path.startsWith('/api/admin/cv-templates?')) return Promise.resolve([TEMPLATE]);
      if (path === '/api/admin/cv-templates/preview') {
        return Promise.resolve({
          ...PREVIEW,
          image: null,
          error: 'The template could not be compiled.',
          latexError: { message: 'The template could not be compiled.' },
        });
      }
      return Promise.resolve(TEMPLATE);
    });

    await openEditor();

    // The message also appears in the preview pane, which is why this asserts on
    // the count plus the absence of a line prefix rather than on one node.
    await screen.findAllByText('The template could not be compiled.');
    expect(screen.queryByText(/^Line \d+:/)).toBeNull();
  });

  // ---- List affordances ----

  it('says a template has no preview image instead of leaving a gap', async () => {
    renderPage();

    expect(await screen.findByText('No preview image')).toBeTruthy();
  });

  it('shows the preview image when one is set', async () => {
    apiJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/admin/cv-templates/placeholders')) return Promise.resolve(PLACEHOLDERS);
      if (path.startsWith('/api/admin/cv-templates?')) {
        return Promise.resolve([
          { ...TEMPLATE, preview_image_url: 'https://cdn.example.com/c.png' },
        ]);
      }
      return Promise.resolve(TEMPLATE);
    });
    renderPage();

    expect(await screen.findByRole('img', { name: 'Classic preview' })).toBeTruthy();
    expect(screen.queryByText('No preview image')).toBeNull();
  });

  it('marks the active template with a badge', async () => {
    renderPage();

    expect(await screen.findByText('ACTIVE')).toBeTruthy();
  });

  // Not a hard block: an admin part-way through an edit has to be able to save
// and mark active. The consequence still has to be stated.
  it('warns that an active template has outstanding items', async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText('LaTeX source'), {
      target: { value: '\\documentclass{article}\n{{projects}}\n' },
    });

    expect(
      await screen.findByText(/users may see a blank field/),
    ).toBeTruthy();
  });

  it('warns specifically about a template that does not render', async () => {
    const editor = await openEditor();
    // A valid preview, then an edit that has not been re-previewed.
    await waitFor(
      () => expect(screen.queryByText(/before activating/)).toBeNull(),
      { timeout: 2000 },
    );
    fireEvent.change(editor, { target: { value: `${VALID_SOURCE}\\mypkg` } });

    expect(
      await screen.findByText(/template that does not render/),
    ).toBeTruthy();
  });

  it('says nothing once every requirement is met', async () => {
    await openEditor();
    await waitFor(
      () => expect(screen.queryByText(/before activating/)).toBeNull(),
      { timeout: 2000 },
    );

    expect(screen.queryByText(/users may/)).toBeNull();
  });

  it('surfaces the rejected package by name', async () => {
    apiJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/admin/cv-templates/placeholders')) return Promise.resolve(PLACEHOLDERS);
      if (path.startsWith('/api/admin/cv-templates?')) return Promise.resolve([TEMPLATE]);
      if (path === '/api/admin/cv-templates' || path.startsWith('/api/admin/cv-templates/')) {
        return Promise.reject(
          new Error('Template may not load the LaTeX package "mypkg"'),
        );
      }
      return Promise.resolve(TEMPLATE);
    });
    renderPage();
    await screen.findByText('Classic');

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Modern' } });
    fireEvent.change(screen.getByLabelText('LaTeX source'), {
      target: { value: VALID_SOURCE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    expect(
      await screen.findByText(
        'Template may not load the LaTeX package "mypkg"',
      ),
    ).toBeTruthy();
  });
});
