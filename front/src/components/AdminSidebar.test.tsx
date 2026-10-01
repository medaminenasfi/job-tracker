import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSidebar } from './AdminSidebar';

const { pathnameMock, logoutMock } = vi.hoisted(() => ({
  pathnameMock: { current: '/admin' },
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
    adminUser: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'ADMIN' },
    adminLogout: logoutMock,
  }),
}));

beforeEach(() => {
  pathnameMock.current = '/admin';
  logoutMock.mockClear();
});

describe('AdminSidebar', () => {
  it('keeps nested admin routes active', () => {
    pathnameMock.current = '/admin/users/42';
    render(<AdminSidebar />);

    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page');
  });

  it('closes the drawer after selecting an admin route', () => {
    render(<AdminSidebar />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open admin navigation menu' }));
    });
    const drawer = screen.getByRole('dialog', { name: 'Admin navigation menu' });

    act(() => {
      fireEvent.click(within(drawer).getByRole('link', { name: 'Jobs' }));
    });

    expect(screen.queryByRole('dialog', { name: 'Admin navigation menu' })).toBeNull();
  });

  it('preserves the admin logout action', () => {
    render(<AdminSidebar />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    });

    expect(logoutMock).toHaveBeenCalledWith('/admin/login');
  });
});