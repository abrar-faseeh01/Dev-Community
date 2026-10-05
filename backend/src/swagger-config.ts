import { DocumentBuilder } from '@nestjs/swagger';

// The OpenAPI document's title, description and security scheme. Kept apart
// from main.ts so the e2e test that snapshots the generated document builds it
// exactly the way the running app does.
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Developer Community API')
    .setDescription(
      'API documentation for the Developer Community Platform. Every response follows the shared envelope: {success:true, data} on success or {success:false, statusCode, message, errors} on failure. ' +
        "Auth is an httpOnly `access_token` cookie set by POST /auth/login — there is no bearer header. In Swagger UI, use POST /auth/login's Try it out (with `credentials: 'include'`-equivalent cookie handling) once, then the cookie is sent automatically by the browser on subsequent Try it out calls for protected routes. " +
        'The access token is a short-lived JWT (15 minutes by default). Login also sets an httpOnly `refresh_token` cookie (7 days by default, sent only to /auth/*); when a protected call returns 401 because the access token expired, call POST /auth/refresh to get a new one. Up to 5 devices can be signed in at once. ' +
        'Request bodies must be JSON (`Content-Type: application/json`, otherwise 415) and at most 100kb (otherwise 413). Both come back in the standard failure envelope. Rate-limited routes answer 429 with a `Retry-After` header.',
    )
    .setVersion('1.0')
    .addCookieAuth(
      'access_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description: 'httpOnly JWT cookie set by POST /auth/login.',
      },
      // Security scheme name — must match every @ApiCookieAuth('access_token')
      // call site, or Swagger UI's Authorize dialog and each route's security
      // requirement silently point at a scheme that doesn't exist (addCookieAuth
      // defaults this third argument to 'cookie', not the cookie name itself).
      'access_token',
    )
    .build();
}
