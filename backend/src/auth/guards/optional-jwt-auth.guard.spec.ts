import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

// handleRequest is the only thing this guard changes about the stock
// AuthGuard('jwt'): what to do with the strategy's outcome. Whether the
// strategy really produces "no user" for a missing or bad cookie is exercised
// against the running app in the e2e spec.
describe('OptionalJwtAuthGuard.handleRequest', () => {
  const guard = new OptionalJwtAuthGuard();
  const user = { userId: 'u1', fullName: 'A', email: 'a@x.test', role: 'user' };

  it('hands back the user when the token was valid', () => {
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('hands back null, without throwing, when there was no token', () => {
    // passport reports "no token" as user = false
    expect(guard.handleRequest(null, false)).toBeNull();
  });

  it('hands back null, without throwing, when the token was bad or the account is gone', () => {
    expect(guard.handleRequest(new Error('jwt expired'), false)).toBeNull();
    expect(guard.handleRequest(new Error('Unauthorized'), null)).toBeNull();
  });
});
