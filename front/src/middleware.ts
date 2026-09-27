import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protect all /dashboard/* routes
export function middleware(request: NextRequest) {
  const refreshToken = request.cookies.get('refreshToken');
  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard');

  if (isDashboard && !refreshToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect logged-in users away from login/register
  if ((request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register') && refreshToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register'],
};
