import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

// The 401 every cookie-protected route can return, word for word the same in
// every controller, so it is defined once.
export const UNAUTHORIZED_RESPONSE = {
  description: 'Missing, invalid, or expired session cookie.',
  type: ErrorResponseDto,
};

// Documents that a route (or a whole controller) needs the signed-in session
// cookie: the security requirement plus the 401. Behaviour is unchanged: the
// protection itself is the global JwtAuthGuard, not this decorator.
export function ApiSessionRequired() {
  return applyDecorators(
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiCookieAuth('access_token'),
  );
}
