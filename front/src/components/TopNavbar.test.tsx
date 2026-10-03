import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopNavbar } from './TopNavbar';
import { ThemeProvider } from '@/context/ThemeContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { pathnameMock, logoutMock } = vi.hoisted(() => ({
  pathnameMock: { current: '/dashboard' },
  logoutMock: vi.fn(),
}));

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
vi.mock('@/lib/api', () => ({
  apiJson: vi.fn().mockResolvedValue([
    { id: 'n1', body: 'Follow up on Dev at Co', read: false, createdAt: '2026-10-03T10:00:00Z' },
  ]),
}));

function renderNavbar(props: Partial<React.ComponentProps<typeof TopNavbar>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TopNavbar
          isCollapsed={false}
          onToggleSidebar={props.onToggleSidebar ?? vi.fn()}
          onOpenMobile={props.onOpenMobile ?? vi.fn()}
        />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  pathnameMock.current = '/dashboard';
  logoutMock.mockClear();
});

describe('TopNavbar', () => {
  it('shows the current page title and a working sidebar toggle', () => {
    const onToggleSidebar = vi.fn();
    renderNavbar({ onToggleSidebar });

    // Both the mobile and desktop bars render in jsdom (no CSS media
    // queries); the desktop bar is the second one.
    const titles = screen.getAllByText('Dashboard');
    expect(titles.length).toBeGreaterThan(0);
    const toggles = screen.getAllByRole('button', { name: 'Collapse sidebar' });
    act(() => {
      fireEvent.click(toggles[toggles.length - 1]);
    });
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('opens the mobile drawer from the hamburger button', () => {
    const onOpenMobile = vi.fn();
    renderNavbar({ onOpenMobile });

    const hamburger = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(hamburger).toBeTruthy();
    act(() => {
      fireEvent.click(hamburger);
    });
    expect(onOpenMobile).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the notification popup, and shows unread items', async () => {
    renderNavbar();

    const bell = screen.getAllByRole('button', { name: 'Notifications' })[0];
    act(() => {
      fireEvent.click(bell);
    });
    expect(await screen.findAllByRole('menu', { name: 'Notifications' })).toBeTruthy();
    expect((await screen.findAllByText('Follow up on Dev at Co')).length).toBeGreaterThan(0);

    // Clicking the bell again closes it.
    act(() => {
      fireEvent.click(bell);
    });
    expect(screen.queryAllByRole('menu', { name: 'Notifications' })).toHaveLength(0);
  });

  it('opens and closes the user menu, and logs out with the existing auth flow', async () => {
    renderNavbar();

    const userButton = screen.getAllByRole('button', { name: 'Open user menu' })[0];
    act(() => {
      fireEvent.click(userButton);
    });
    const menu = await screen.findAllByRole('menu', { name: 'User menu' });
    expect(menu).toBeTruthy();
    expect(screen.getAllByText('Ada Lovelace')[0]).toBeTruthy();
    expect(screen.getAllByText('ada@example.com')[0]).toBeTruthy();
    expect(screen.getAllByRole('menuitem', { name: 'Profile' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: 'Settings' }).length).toBeGreaterThan(0);

    act(() => {
      fireEvent.click(screen.getAllByRole('menuitem', { name: 'Log out' })[0]);
    });
    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
  });

  it('allows only one popup open at a time', async () => {
    renderNavbar();

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Notifications' })[0]);
    });
    expect(await screen.findAllByRole('menu', { name: 'Notifications' })).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Open user menu' })[0]);
    });
    expect(screen.queryAllByRole('menu', { name: 'Notifications' })).toHaveLength(0);
    expect(await screen.findAllByRole('menu', { name: 'User menu' })).toBeTruthy();
  });

  it('closes the open popup with Escape', async () => {
    renderNavbar();

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Open user menu' })[0]);
    });
    expect(await screen.findAllByRole('menu', { name: 'User menu' })).toBeTruthy();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryAllByRole('menu', { name: 'User menu' })).toHaveLength(0);
  });

  it('closes the open popup when clicking outside', async () => {
    renderNavbar();

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Open user menu' })[0]);
    });
    expect(await screen.findAllByRole('menu', { name: 'User menu' })).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(screen.queryAllByRole('menu', { name: 'User menu' })).toHaveLength(0);
  });

  it('reflects the current route in the title', () => {
    pathnameMock.current = '/dashboard/analytics/anything';
    renderNavbar();
    expect(screen.getAllByText('Analytics').length).toBeGreaterThan(0);
  });
});
