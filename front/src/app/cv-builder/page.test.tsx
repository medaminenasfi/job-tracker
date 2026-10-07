import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CvBuilderPage from './page';

const { apiJsonMock, downloadMock } = vi.hoisted(() => ({
  apiJsonMock: vi.fn(),
  downloadMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
  downloadApiFile: (...args: unknown[]) => downloadMock(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
  }),
}));

// The guard is mocked to render its children, so the default page export mounts
// CvBuilderView directly — the view stays module-local (Next only allows the
// page export on a page file) but is still fully exercised here.
vi.mock('@/components/DashboardGuard', () => ({
  DashboardGuard: ({ children }: { children: React.ReactNode }) => children,
}));

const TEMPLATES = [
  {
    id: 't1',
    name: 'Classic',
    description: 'Single column',
    language: 'en',
    preview_image_url: null,
  },
];

const PROFILE = {
  headline: 'Senior Engineer',
  yearsExperience: 6,
  skills: ['TypeScript', 'Docker'],
  bio: null,
};

const SAVED_CV = {
  id: 'cv1',
  label: 'Dev CV',
  source: 'uploaded',
  is_default: true,
  created_at: '2026-10-01T00:00:00Z',
  structured_data: {
    fullName: 'Ada L.',
    email: 'ada@cv.example',
    phone: '+33 6 12 34 56 78',
    links: ['https://linkedin.com/in/ada'],
    experience: [{ text: 'Engineer, ACME', dateRange: '2021 - Present' }],
    education: [],
    skills: ['Go'],
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CvBuilderPage />
    </QueryClientProvider>,
  );
}

/** Routes the mocked api calls by path, like the real client does. */
function mockApi(overrides: Record<string, () => Promise<unknown>> = {}) {
  apiJsonMock.mockImplementation((path: string) => {
    if (path in overrides) return overrides[path]();
    if (path === '/api/cv-templates') return Promise.resolve(TEMPLATES);
    if (path === '/api/profile') return Promise.resolve(PROFILE);
    if (path === '/api/cvs') return Promise.resolve([]);
    // The live preview pane auto-fires ~700ms after a template is selected, so
    // every builder test needs this route to resolve rather than hit the reject.
    if (path === '/api/cvs/build/preview')
      return Promise.resolve({ image: 'data:image/png;base64,PREVIEW' });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
}

async function openBuilder() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Classic/ }));
  return screen.findByRole('button', { name: 'Generate PDF' });
}

beforeEach(() => {
  apiJsonMock.mockReset();
  downloadMock.mockReset();
  downloadMock.mockResolvedValue(undefined);
});

describe('CvBuilderView', () => {
  it('lists the active templates', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('Classic')).toBeTruthy();
    expect(screen.getByText('Single column')).toBeTruthy();
    expect(apiJsonMock).toHaveBeenCalledWith('/api/cv-templates');
  });

  it('tells the user when no template is available', async () => {
    mockApi({ '/api/cv-templates': () => Promise.resolve([]) });
    renderPage();

    expect(await screen.findByText('No templates available')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate PDF' })).toBeNull();
  });

  it('pre-fills the form from the profile and the account', async () => {
    mockApi();
    await openBuilder();

    await waitFor(() => {
      expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe(
        'Ada Lovelace',
      );
    });
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
    expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe(
      'Senior Engineer',
    );
    // Short chips re-flow onto one comma-joined line so the preview reads as
    // grouped skills instead of a one-per-row column.
    expect((screen.getByLabelText('Skills') as HTMLTextAreaElement).value).toBe(
      'TypeScript, Docker',
    );
  });

  // The Profile summary is authored on the dashboard profile (bio), so it
  // pre-fills from there; Certificates has no parsed source and starts empty but
  // must still be present as its own section.
  it('pre-fills Profile from the bio and offers a Certificates section', async () => {
    mockApi({
      '/api/profile': () =>
        Promise.resolve({ ...PROFILE, bio: 'Engineer who ships dependable web apps.' }),
    });
    await openBuilder();

    await waitFor(() => {
      expect((screen.getByLabelText('Profile') as HTMLTextAreaElement).value).toBe(
        'Engineer who ships dependable web apps.',
      );
    });
    expect(screen.getByLabelText('Certificates')).toBeTruthy();
    expect((screen.getByLabelText('Certificates') as HTMLTextAreaElement).value).toBe(
      '',
    );
  });

  it('shows a live preview once a template is selected', async () => {
    mockApi();
    await openBuilder();

    // The shared pane debounces ~700ms, POSTs the current field values, and
    // renders the returned PNG — no extra button, and nothing is persisted.
    expect(
      await screen.findByRole('img', { name: 'Rendered CV preview' }, { timeout: 2000 }),
    ).toBeTruthy();
    expect(apiJsonMock).toHaveBeenCalledWith(
      '/api/cvs/build/preview',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"template_id":"t1"'),
      }),
    );
  });

  it('generates a PDF and offers the download once the build is ready', async () => {
    const build = { id: 'g1', status: 'queued', pdf_url: null };
    mockApi({
      '/api/cvs/build': () => Promise.resolve(build),
      '/api/cvs/build/g1': () =>
        Promise.resolve({
          id: 'g1',
          status: 'ready',
          pdf_url: '/api/cvs/build/g1/file',
        }),
    });

    await openBuilder();
    await waitFor(() =>
      expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe(
        'Ada Lovelace',
      ),
    );
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Ada Lovelace ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));

    expect(await screen.findByText(/Queued|Compiling/)).toBeTruthy();
    const postCall = apiJsonMock.mock.calls.find(
      ([path]) => path === '/api/cvs/build',
    );
    // Blank fields are still sent so the stored CV keeps a stable shape.
    expect(JSON.parse((postCall?.[1] as { body: string }).body)).toEqual({
      template_id: 't1',
      fields: {
        fullName: 'Ada Lovelace',
        headline: 'Senior Engineer',
        profile: '',
        email: 'ada@example.com',
        phone: '',
        links: '',
        experience: '',
        education: '',
        certificates: '',
        skills: 'TypeScript, Docker',
      },
    });

    const download = await screen.findByRole(
      'button',
      { name: 'Download PDF' },
      { timeout: 4000 },
    );
    fireEvent.click(download);
    expect(downloadMock).toHaveBeenCalledWith(
      '/api/cvs/build/g1/file',
      'cv-g1.pdf',
    );
  }, 10000);

  it('shows the server error when a build fails', async () => {
    mockApi({
      '/api/cvs/build': () =>
        Promise.resolve({ id: 'g1', status: 'failed', error_message: 'Compilation took too long. Try a shorter CV or a simpler template.' }),
    });

    await openBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));

    expect(
      await screen.findByText('Compilation took too long. Try a shorter CV or a simpler template.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('surfaces a rejected request instead of pretending to build', async () => {
    mockApi({
      '/api/cvs/build': () => Promise.reject(new Error('Template not found')),
    });

    await openBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));

    expect(await screen.findByText('Template not found')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull();
  });

  it('copies a saved CV into the form when it is selected', async () => {
    mockApi({ '/api/cvs': () => Promise.resolve([SAVED_CV]) });

    await openBuilder();
    fireEvent.change(await screen.findByLabelText('Saved CV'), {
      target: { value: 'cv1' },
    });

    await waitFor(() => {
      expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe(
        'Ada L.',
      );
    });
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'ada@cv.example',
    );
    expect((screen.getByLabelText('Links') as HTMLTextAreaElement).value).toBe(
      'https://linkedin.com/in/ada',
    );
    // The parser never decomposes role vs company, so a pre-filled entry keeps
    // its raw text and the card titles it with that text (first line) rather
    // than guessing an "Engineer — ACME" split that leaves most rows Untitled.
    await waitFor(() => {
      expect(screen.getByText('Engineer, ACME')).toBeTruthy();
      expect(screen.getByText('2021 - Present')).toBeTruthy();
    });
    // The saved CV wins for skills, the profile only fills the gaps.
    expect((screen.getByLabelText('Skills') as HTMLTextAreaElement).value).toBe(
      'Go',
    );
  });

  // The parser reports a date range alongside text that still contains the
  // years, so appending it produced "Licence ... 2022 - 2025 ... (2025)".
  it('does not repeat a year the entry text already carries', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([
          {
            ...SAVED_CV,
            structured_data: {
              ...SAVED_CV.structured_data,
              experience: [
                {
                  text: 'Technicien Support IT, Cabinet (Mai 2026 – Présent)',
                  dateRange: '2026 - Present',
                },
              ],
              education: [
                {
                  text: 'Licence en Systèmes d’Information 2022 – 2025',
                  dateRange: '2022 - 2025',
                },
              ],
            },
          },
        ]),
    });

    await openBuilder();
    fireEvent.change(await screen.findByLabelText('Saved CV'), {
      target: { value: 'cv1' },
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Education') as HTMLTextAreaElement).value,
      ).toBe('Licence en Systèmes d’Information 2022 – 2025');
    });
    // Experience is now structured entries - check the card uses em dash
    await waitFor(() => {
      // The card shows role — company on first line; text may be split across elements
      expect(screen.getByText(/Technicien Support IT/)).toBeTruthy();
      expect(screen.getByText(/Cabinet/)).toBeTruthy();
      expect(screen.getByText('2026 - Present')).toBeTruthy();
      // The date range should NOT be appended again since text already has it
      expect(screen.queryByText(/\(2026 - Present\)/)).toBeNull();
    });
  });

  // Regression: a parsed entry with no "Role, Company" separator used to render
  // as "Untitled entry", and the parser's nonsense dateRange ("2025 - 2024",
  // from collapsing a multi-job block) was copied straight onto the card. The
  // card now titles the row from its first text line and drops a backwards range.
  it('titles a parsed entry from its text and drops a backwards date range', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([
          {
            ...SAVED_CV,
            structured_data: {
              ...SAVED_CV.structured_data,
              experience: [
                {
                  text: 'Full-Stack Developer & Freelance\nBuilt four client apps end to end.',
                  dateRange: '2025 - 2024',
                },
              ],
            },
          },
        ]),
    });

    await openBuilder();
    fireEvent.change(await screen.findByLabelText('Saved CV'), {
      target: { value: 'cv1' },
    });

    await waitFor(() => {
      expect(screen.getByText('Full-Stack Developer & Freelance')).toBeTruthy();
    });
    // The remaining lines preview as the body rather than repeating the title.
    expect(screen.getByText('Built four client apps end to end.')).toBeTruthy();
    // The backwards range is dropped instead of shown for the user to notice.
    expect(screen.queryByText('2025 - 2024')).toBeNull();
    expect(screen.queryByText('Untitled entry')).toBeNull();
  });

  // A PDF whose text layer drops the year still gets the range appended.
  it('appends the date range when the text has no year of its own', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([
          {
            ...SAVED_CV,
            structured_data: {
              ...SAVED_CV.structured_data,
              education: [{ text: 'MSc Mathematics', dateRange: '2015 - 2018' }],
            },
          },
        ]),
    });

    await openBuilder();
    fireEvent.change(await screen.findByLabelText('Saved CV'), {
      target: { value: 'cv1' },
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Education') as HTMLTextAreaElement).value,
      ).toBe('MSc Mathematics (2015 - 2018)');
    });
  });

  // The parser reports one chip per skill; printing thirty chips as thirty
  // rows of one word each is what made parsed CVs look broken, so chips are
  // re-flowed into lines of at most ~90 characters.
  it('re-flows skill chips into readable lines', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([
          {
            ...SAVED_CV,
            structured_data: {
              ...SAVED_CV.structured_data,
              skills: [
                'Matériel & Maintenance',
                'Montage et mise en service de postes de travail',
                'diagnostic de pannes',
                'maintenance préventive/corrective',
                'installation de périphériques',
                'Systèmes',
                'Windows (installation',
                'configuration',
                'dépannage)',
              ],
            },
          },
        ]),
    });

    await openBuilder();
    fireEvent.change(await screen.findByLabelText('Saved CV'), {
      target: { value: 'cv1' },
    });

    await waitFor(() => {
      expect((screen.getByLabelText('Skills') as HTMLTextAreaElement).value).toBe(
        [
          'Matériel & Maintenance, Montage et mise en service de postes de travail',
          'diagnostic de pannes, maintenance préventive/corrective, installation de périphériques',
          'Systèmes, Windows (installation, configuration, dépannage)',
        ].join('\n'),
      );
    });
  });

  it('tells the user skills are entered one group per line', async () => {
    mockApi();
    await openBuilder();
    expect(screen.getByText(/One group per line/)).toBeTruthy();
  });

  // The eight fields read as a CV, not one flat wall: each group is a labelled
  // <fieldset>, so assistive tech announces the section a field belongs to.
  it('groups the fields into readable sections', async () => {
    mockApi();
    await openBuilder();

    expect(screen.getByRole('group', { name: 'About you' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Contact' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Your background' })).toBeTruthy();
    // Grouping is presentational: the fields keep their exact labels.
    expect(screen.getByLabelText('Full name')).toBeTruthy();
    expect(screen.getByLabelText('Skills')).toBeTruthy();
  });

  it('shows the structured experience section with add button', async () => {
    mockApi();
    await openBuilder();

    // Experience section exists with its own card
    expect(screen.getByRole('heading', { name: 'Experience' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add experience/ })).toBeTruthy();
  });

  it('says what the section fields expect, with a worked example', async () => {
    mockApi();
    await openBuilder();

    expect(
      screen.getByText(/One entry per line, e\.g\. MSc, University \(2015 - 2018\)/),
    ).toBeTruthy();
    expect(
      screen.getByText(/One group per line, e\.g\. Languages: Go, Python, TypeScript/),
    ).toBeTruthy();
  });

  // An entry with no dates shows a nudge in the structured entries UI.
  it('flags an experience entry that carries no dates, without blocking', async () => {
    mockApi();
    await openBuilder();

    // Open the experience modal and add an entry without dates
    fireEvent.click(screen.getByRole('button', { name: /^Add experience$/ }));
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Engineer' } });
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'ACME' } });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add experience' }));

    // The entry appears without a date range, but no blocking error
    await waitFor(() => {
      expect(screen.getByText('Engineer — ACME')).toBeTruthy();
    });
    expect(screen.queryByText(/Missing dates\?/)).toBeNull();
    // Generate PDF is still enabled
    expect(
      (screen.getByRole('button', { name: 'Generate PDF' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('shows a real empty state when there is no saved CV to pre-fill from', async () => {
    mockApi();
    await openBuilder();

    expect(
      await screen.findByText('No saved CVs yet — upload one or fill in the form below'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Saved CV')).toBeNull();
  });

  it('flags a saved CV that still needs review rather than presenting it as clean', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([{ ...SAVED_CV, parse_status: 'partial' }]),
    });
    await openBuilder();

    const select = await screen.findByLabelText('Saved CV') as HTMLSelectElement;
    const option = select.querySelector('option[value="cv1"]');
    expect(option?.textContent).toContain('Needs review');
  });

  it('marks a fully parsed saved CV as parsed', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([{ ...SAVED_CV, parse_status: 'parsed' }]),
    });
    await openBuilder();

    const select = await screen.findByLabelText('Saved CV') as HTMLSelectElement;
    expect(select.querySelector('option[value="cv1"]')?.textContent).toContain(
      'Parsed',
    );
  });

  it('offers the profile-only path when saved CVs exist but none is parsed', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([
          { ...SAVED_CV, structured_data: null, parse_status: 'failed' },
        ]),
    });
    await openBuilder();

    expect(await screen.findByText(/No parsed CVs yet/)).toBeTruthy();
  });

  // A partial parse means a header went unrecognised, so that section's content
// ended up in the next one. Naming the empty section is more useful than a
// blanket "check everything".
  it('names the sections a partial parse left empty and offers AI parsing', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([
          {
            ...SAVED_CV,
            parse_status: 'partial',
            structured_data: {
              ...SAVED_CV.structured_data,
              experience: [{ text: 'Engineer, ACME', dateRange: '2021 - Present' }],
              education: [],
              skills: ['Go'],
            },
          },
        ]),
    });
    await openBuilder();
    fireEvent.change(await screen.findByLabelText('Saved CV'), {
      target: { value: 'cv1' },
    });

    expect(await screen.findByText(/Education came out empty/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Try AI parsing/ })).toBeTruthy();
    // Experience and Skills were parsed, so they are not flagged.
    expect(screen.queryByText(/Experience came out empty/)).toBeNull();
  });

  it('does not flag sections for a CV that parsed cleanly', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([
          {
            ...SAVED_CV,
            parse_status: 'parsed',
            structured_data: {
              ...SAVED_CV.structured_data,
              experience: [{ text: 'Engineer, ACME', dateRange: '2021 - Present' }],
              education: [],
              skills: [],
            },
          },
        ]),
    });
    await openBuilder();
    fireEvent.change(await screen.findByLabelText('Saved CV'), {
      target: { value: 'cv1' },
    });

    // The CV was applied, and nothing is called out for review.
    await waitFor(() =>
      expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe(
        'Ada L.',
      ),
    );
    expect(screen.queryByText(/came out empty/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Try AI parsing/ })).toBeNull();
  });

  it('refuses to generate without a full name and says why', async () => {
    mockApi({
      '/api/profile': () => Promise.resolve({ ...PROFILE, headline: '', skills: [] }),
    });
    await openBuilder();

    const name = await screen.findByLabelText('Full name');
    fireEvent.change(name, { target: { value: '   ' } });

    const button = screen.getByRole('button', {
      name: 'Generate PDF',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Add a full name to generate your CV.')).toBeTruthy();
  });

  // A disabled button that names nothing leaves the user hunting: the whole
  // point of `canSubmit` is that the reason is on screen next to it.
  it('names the field that is over its limit instead of just refusing', async () => {
    mockApi({
      '/api/profile': () => Promise.resolve({ ...PROFILE, headline: '', skills: [] }),
    });
    await openBuilder();

    const phone = await screen.findByLabelText('Phone');
    // Phone caps at 50 characters.
    fireEvent.change(phone, { target: { value: '+216 27 711 810 '.repeat(5) } });

    const button = screen.getByRole('button', {
      name: 'Generate PDF',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      screen.getByText(/Shorten Phone — it exceeds 50 characters\./),
    ).toBeTruthy();
  });

  // One character under the cap must still build: an off-by-one here silently
  // blocks a valid CV.
  it('allows a value that sits exactly on the limit', async () => {
    mockApi({
      '/api/profile': () => Promise.resolve({ ...PROFILE, headline: '', skills: [] }),
    });
    await openBuilder();

    const phone = await screen.findByLabelText('Phone');
    fireEvent.change(phone, { target: { value: 'a'.repeat(50) } });

    const button = screen.getByRole('button', {
      name: 'Generate PDF',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByText(/Shorten Phone/)).toBeNull();
  });

  // The "Saved CV" dropdown used to hide every generated CV, so a CV you built
  // here could not be reopened as a pre-fill source. It now lists any CV with
  // parsed content, and identical labels are told apart by their created date.
  it('lists generated CVs too, each told apart by its date', async () => {
    mockApi({
      '/api/cvs': () =>
        Promise.resolve([
          SAVED_CV,
          {
            ...SAVED_CV,
            id: 'cv2',
            source: 'built',
            is_default: false,
            created_at: '2026-09-15T00:00:00Z',
            structured_data: {
              ...SAVED_CV.structured_data,
              fullName: 'Built Name',
            },
          },
        ]),
    });
    await openBuilder();

    const select = (await screen.findByLabelText('Saved CV')) as HTMLSelectElement;
    // The generated CV is offered as a source...
    expect(select.querySelector('option[value="cv2"]')).toBeTruthy();
    // ...and the two identical "Dev CV" labels differ (by their dates).
    const devLabels = Array.from(select.options)
      .map((o) => o.textContent)
      .filter((t) => t?.startsWith('Dev CV'));
    expect(devLabels).toHaveLength(2);
    expect(devLabels[0]).not.toBe(devLabels[1]);

    // Selecting the generated CV copies its content into the form.
    fireEvent.change(select, { target: { value: 'cv2' } });
    await waitFor(() =>
      expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe(
        'Built Name',
      ),
    );
  });

  it('adds an experience entry through the modal', async () => {
    mockApi();
    await openBuilder();

    // Closed until "Add experience" is clicked
    expect(screen.queryByRole('dialog')).toBeNull();
    // Use the card header button specifically (not the modal save button)
    fireEvent.click(screen.getByRole('button', { name: /^Add experience$/ }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Engineer' } });
    // The dialog's own Save button, not the card-header "Add experience".
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add experience' }));

    // The entry is listed in the structured entries UI
    expect(await screen.findByText('Engineer — Acme')).toBeTruthy();
    // The hidden experience field is updated for the template
    await waitFor(() =>
      expect(screen.getByTestId('experience-field')).toHaveProperty('value', 'Engineer, Acme'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Typing must not save-and-close on every keystroke (the old wiring did), and
  // an empty entry is rejected without discarding the modal.
  it('keeps the modal open and flags an empty experience entry', async () => {
    mockApi();
    await openBuilder();

    fireEvent.click(screen.getByRole('button', { name: /^Add experience$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add experience' }));

    expect(
      await screen.findByText('Add at least a company, role, or description'),
    ).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('edits an existing entry in place instead of duplicating it', async () => {
    mockApi();
    await openBuilder();

    fireEvent.click(screen.getByRole('button', { name: /^Add experience$/ }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Engineer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add experience' }));
    // The list title uses an em dash ("Engineer — Acme"), the compiled textarea
    // a comma ("Engineer, Acme"), so this matches only the listed entry.
    await screen.findByText('Engineer — Acme');

    fireEvent.click(screen.getByRole('button', { name: 'Edit experience' }));
    dialog = await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Edit experience' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Lead' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Lead — Acme')).toBeTruthy();
    // Replaced, not added: still exactly one entry.
    expect(screen.getAllByRole('button', { name: 'Edit experience' })).toHaveLength(1);
  });

  it('deletes an experience entry', async () => {
    mockApi();
    await openBuilder();

    fireEvent.click(screen.getByRole('button', { name: /^Add experience$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Engineer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add experience' }));
    await screen.findByText('Engineer — Acme');

    fireEvent.click(screen.getByRole('button', { name: 'Delete experience' }));
    await waitFor(() => expect(screen.queryByText('Engineer — Acme')).toBeNull());
    expect(screen.getByText(/No experience entries yet/)).toBeTruthy();
  });
});