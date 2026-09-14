import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/dashboard", "/settings", "/profile", "/posts", "/admin"]; // add more protected routes here as you build them

export function middleware(req: NextRequest) {
  const isProtected = PROTECTED_PATHS.some((p) =>
    req.nextUrl.pathname.startsWith(p),
  );
  if (!isProtected) return NextResponse.next();

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
