import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/dashboard", "/settings", "/profile", "/admin"]; // add more protected routes here as you build them

// Posts are readable without an account (the API's GET /posts and
// GET /posts/:id are public), so only the pages that write are protected:
// /posts/create, /posts/mine and /posts/<id>/edit. The feed (/posts) and a single post
// (/posts/<id>) stay open to anonymous visitors.
const PROTECTED_POST_PATTERNS = [
  /^\/posts\/create(\/|$)/,
  /^\/posts\/mine(\/|$)/,
  /^\/posts\/[^/]+\/edit(\/|$)/,
];

function isProtected(pathname: string): boolean {
  return (
    PROTECTED_PATHS.some((p) => pathname.startsWith(p)) ||
    PROTECTED_POST_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}

export function middleware(req: NextRequest) {
  if (!isProtected(req.nextUrl.pathname)) return NextResponse.next();

  // Presence check only — actual validity is checked server-side via /auth/me.
  // This just stops obviously-logged-out users from loading the page.
  const hasCookie = req.cookies.has("access_token");
  if (!hasCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/posts/:path*",
    "/admin/:path*",
  ],
};
