import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_PUBLIC = ['/admin/login', '/admin/register'];

// Two independent sessions:
//   - refreshToken       -> user session, gates /dashboard/*
//   - adminRefreshToken  -> admin session, gates /admin/*
// They are separate cookies so a normal user can be signed into /dashboard while
// an admin is signed into /admin, without one logging out the other. Role is
// enforced authoritatively by the API's RolesGuard.
export function middleware(request: NextRequest) {
  const userToken = request.cookies.get('refreshToken');
  const adminToken = request.cookies.get('adminRefreshToken');
  const path = request.nextUrl.pathname;
  const isDashboard = path.startsWith('/dashboard');
  const isAdmin = path.startsWith('/admin');
  const isAdminPublic = ADMIN_PUBLIC.some((p) => path === p);

  if (isDashboard && !userToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Admin panel routes (everything under /admin except login/register) need an
  // admin session.
  if (isAdmin && !isAdminPublic && !adminToken) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Redirect already-authenticated users away from the sign-in pages.
  if ((path === '/login' || path === '/register') && userToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  if (isAdminPublic && adminToken) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/register'],
};
