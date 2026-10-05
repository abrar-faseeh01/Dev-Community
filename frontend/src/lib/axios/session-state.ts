// Whether the app has deliberately ended this session (the user clicked
// Logout). The interceptor reads it: once the cookies are gone on purpose, a
// 401 from a protected call that is still running or about to be retried means
// "you signed out", not "your session expired", so it must not try a refresh or
// send the visitor to /login?reason=session-expired.
//
// Written only by the auth mutation hooks (useLogout sets it, a failed logout,
// a login and a signup clear it). It is module state, so a full page load
// starts it cleared, and a second tab never sees it: another tab's genuine
// expiry is still reported as one.
let signedOut = false;

export function markSignedOut() {
  signedOut = true;
}

export function markSignedIn() {
  signedOut = false;
}

export function isSignedOut() {
  return signedOut;
}
