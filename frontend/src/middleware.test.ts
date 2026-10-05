/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

// The middleware only checks that the `access_token` cookie EXISTS; it never
// reads or verifies it (the backend is the real boundary). That is what lets
// the refresh flow work: the access cookie now lives as long as the refresh
// token, while the JWT inside it lasts 15 minutes, so a visitor whose access
// token has expired still gets the page, and the page's own /auth/me call
// refreshes the session. If the cookie vanished with the JWT, this middleware
// would bounce them to /login before any refresh could run.
//
// The refresh cookie is not in this picture: it is scoped to /auth on the API,
// so the browser never sends it to a page, and the middleware must not depend
// on it.
function request(path: string, cookies: Record<string, string> = {}) {
  const header = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`http://localhost:3001${path}`, {
    headers: header ? { cookie: header } : {},
  });
}

function redirectTarget(res: Response) {
  return res.status >= 300 && res.status < 400
    ? new URL(res.headers.get("location") as string).pathname
    : null;
}

const PROTECTED = [
  "/settings",
  "/profile/edit",
  "/admin/users",
  "/posts/create",
  "/posts/mine",
  "/posts/abc123/edit",
];

describe("middleware", () => {
  it.each(PROTECTED)("sends a visitor with no cookie from %s to /login", (path) => {
    expect(redirectTarget(middleware(request(path)))).toBe("/login");
  });

  it.each(PROTECTED)(
    "lets a visitor with an access_token cookie through to %s, whatever is inside it",
    (path) => {
      // An expired JWT looks the same as a good one here, on purpose.
      const res = middleware(request(path, { access_token: "any-value" }));

      expect(redirectTarget(res)).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("does not treat a refresh_token cookie as a session", () => {
    const res = middleware(request("/settings", { refresh_token: "x" }));

    expect(redirectTarget(res)).toBe("/login");
  });

  it.each(["/", "/login", "/signup", "/posts", "/posts/abc123"])(
    "leaves the public page %s alone with no cookie",
    (path) => {
      const res = middleware(request(path));

      expect(redirectTarget(res)).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    },
  );
});
