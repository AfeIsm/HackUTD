// Next 16 "proxy" (was middleware): runs before the signed-in pages render.
// Fast check only: no session cookie → send to /login and come back afterwards.
// The real check (is this session valid?) happens on the server in lib/auth/session.ts.

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/dashboard/:path*', '/buy/:path*', '/huddles/:path*', '/household/:path*', '/friends/:path*'],
};
