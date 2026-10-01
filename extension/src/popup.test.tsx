import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Popup } from './popup';

// Synchronous act() outside of RTL's wrapper.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

interface ChromeMockOptions {
  token?: string | null;
  /** Never answer GET_TOKEN so the popup stays in its loading state. */
  deferToken?: boolean;
  user?: { id: string; name: string; email: string };
  jobs?: Array<{
    id: string;
    title: string;
    company: string;
    url?: string | null;
    status: string;
  }>;
  jobsFail?: boolean;
  tabUrl?: string;
  extracted?: Record<string, string>;
}

let deferredTokenCallback: ((r: unknown) => void) | null = null;

function installChromeMock(opts: ChromeMockOptions = {}) {
  deferredTokenCallback = null;
  const user = opts.user ?? { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' };
  const jobs = opts.jobs ?? [];
  const tabUrl = opts.tabUrl ?? 'https://jobs.example.com/j/42';

  const sendMessage = (
    message: { type?: string } | undefined,
    callback?: (r: unknown) => void,
  ) => {
    const respond = (r: unknown) => callback?.(r);
    switch (message?.type) {
      case 'GET_TOKEN':
        if (opts.deferToken) deferredTokenCallback = callback ?? null;
        else respond({ token: opts.token ?? null });
        break;
      case 'GET_ME':
        respond({ success: true, data: user });
        break;
      case 'GET_JOBS':
        respond(opts.jobsFail ? { success: false, error: 'boom' } : { success: true, data: jobs });
        break;
      default:
        respond({ success: true });
    }
    return undefined;
  };

  Object.assign(globalThis, {
    chrome: {
      runtime: {
        sendMessage,
        lastError: undefined,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      tabs: {
        query: (_q: unknown, cb: (tabs: unknown[]) => void) => cb([{ id: 7, url: tabUrl }]),
        sendMessage: (_id: number, _m: unknown, cb: (r: unknown) => void) =>
          cb({ job: opts.extracted ?? {} }),
        create: vi.fn(),
      },
      scripting: { executeScript: vi.fn() },
    },
  });
}

let container: HTMLDivElement;
let root: Root | null = null;

function renderPopup() {
  root = createRoot(container);
  act(() => {
    root?.render(<Popup />);
  });
}

function buttonLabels(): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container.remove();
});

describe('popup UI states', () => {
  it('shows a loading skeleton until the session is restored', () => {
    installChromeMock({ deferToken: true });
    renderPopup();

    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.querySelector('input')).toBeNull();

    // Session restore answers → the logged-out view replaces the skeleton.
    act(() => {
      deferredTokenCallback?.({ token: null });
    });
    expect(container.textContent).toContain('Please log in to save jobs');
  });

  it('offers the sign-in call to action when logged out', () => {
    installChromeMock({ token: null });
    renderPopup();

    expect(container.textContent).toContain('Please log in to save jobs');
    expect(buttonLabels()).toContain('Log In');
    expect(container.querySelector('input')).toBeNull();
  });

  it('renders the capture form, source chip, status badge and user chip when logged in', () => {
    installChromeMock({
      token: 'test-token',
      extracted: { title: 'Backend Engineer', company: 'Acme', source: 'linkedin' },
      jobs: [
        {
          id: 'j1',
          title: 'Backend Engineer',
          company: 'Acme',
          url: 'https://jobs.example.com/j/42',
          status: 'SAVED',
        },
      ],
    });
    renderPopup();

    const labels = Array.from(container.querySelectorAll('label')).map((l) => l.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Title', 'Company', 'Location', 'Note']));

    expect(container.querySelector('.source-chip')?.textContent).toBe('linkedin');
    expect(container.querySelector('.status-badge.status-saved')).toBeTruthy();
    expect(container.textContent).toContain('Ada Lovelace');
    expect(buttonLabels()).toContain('Save Job');
  });

  it('degrades gracefully when the saved-jobs fetch fails', () => {
    installChromeMock({ token: 'test-token', jobsFail: true });
    renderPopup();

    expect(container.textContent).toContain('Save a job to start tracking applications.');
    // The rest of the popup stays usable.
    expect(container.textContent).toContain('Ada Lovelace');
    expect(buttonLabels()).toContain('Save Job');
  });
});
