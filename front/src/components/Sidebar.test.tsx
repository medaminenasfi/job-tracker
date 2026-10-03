import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import { ThemeProvider } from '@/context/ThemeContext';

const { pathnameMock, logoutMock } = vi.hoisted(() => ({
  pathnameMock: { current: '/dashboard' },
  logoutMock: vi.fn(),
}));

// Next.js link/navigation are framework glue — assert on href/aria instead.
vi.mock('next/link', () => {
  const MockLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'>>(
    ({ href, children, ...rest }, ref) => (
      <a ref={ref} href={typeof href === 'string' ? href : String(href)} {...rest}>
        {children}
      </a>
    ),
  );
  MockLink.displayName = 'MockLink';
  return { default: MockLink };
});
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock.current,
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
    logout: logoutMock,
  }),
}));

function renderSidebar(props: React.ComponentProps<typeof Sidebar> = {}) {
  return render(
    <ThemeProvider>
      <Sidebar {...props} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  pathnameMock.current = '/dashboard';
  logoutMock.mockClear();
  window.localStorage.clear();
});

describe('Sidebar', () => {
  it('renders the nav and marks the current route as the active page', () => {
    pathnameMock.current = '/dashboard/jobs/123';
    renderSidebar();

    const active = screen.getByRole('link', { name: 'Job Track' });
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull();
    expect(active.getAttribute('href')).toBe('/dashboard/jobs');
  });

  it('collapses to icon-only, hides labels from view but keeps them for screen readers, and persists the state', () => {
    const view = renderSidebar();

    act(() => {
      screen.getByRole('button', { name: 'Collapse sidebar' }).click();
    });

    expect(window.localStorage.getItem('jt_sidebar_collapsed')).toBe('1');
    // Collapsed nav links keep an accessible name via sr-only labels.
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();

    // State survives a remount.
    view.unmount();
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();
  });

  it('supports controlled collapse from the parent layout', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ isCollapsed: false, onToggleCollapse });

    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy();
    act(() => {
      screen.getByRole('button', { name: 'Collapse sidebar' }).click();
    });
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    // Controlled mode must not write to localStorage itself.
    expect(window.localStorage.getItem('jt_sidebar_collapsed')).toBeNull();
  });

  it('opens the mobile drawer when controlled and closes it with Escape', () => {
    const onCloseMobile = vi.fn();
    renderSidebar({ mobileOpen: true, onCloseMobile });

    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeTruthy();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it('closes the mobile drawer after selecting a navigation item', () => {
    const onCloseMobile = vi.fn();
    renderSidebar({ mobileOpen: true, onCloseMobile });

    const drawer = screen.getByRole('dialog', { name: 'Navigation menu' });
    act(() => {
      fireEvent.click(within(drawer).getByRole('link', { name: 'Job Track' }));
    });

    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it('calls logout from the pinned footer button', () => {
    renderSidebar();

    act(() => {
      screen.getByRole('button', { name: 'Log out' }).click();
    });

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
