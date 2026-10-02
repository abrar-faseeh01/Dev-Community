import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { NullDataResponseDto } from '../common/dto/null-data-response.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

export function ApiSignup() {
  return applyDecorators(
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded.',
      type: ErrorResponseDto,
    }),
    ApiConflictResponse({
      description: 'Email already in use.',
      type: ErrorResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Validation failed (weak password, invalid email, etc.).',
      type: ErrorResponseDto,
    }),
    ApiCreatedResponse({
      description: 'Account created.',
      type: AuthResponseDto,
    }),
    ApiOperation({
      summary: 'Create an account',
      description: 'Rate-limited to 5 requests/minute per IP.',
    }),
  );
}

export function ApiLogin() {
  return applyDecorators(
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded.',
      type: ErrorResponseDto,
    }),
    ApiUnauthorizedResponse({
      description: 'Invalid email or password.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ description: 'Logged in.', type: AuthResponseDto }),
    ApiOperation({
      summary: 'Log in',
      description:
        'Sets an httpOnly `access_token` cookie on success. Rate-limited to 5 requests/minute per IP.',
    }),
  );
}

export function ApiLogout() {
  return applyDecorators(
    ApiOkResponse({ description: 'Logged out.', type: NullDataResponseDto }),
    ApiOperation({
      summary: 'Log out',
      description:
        'Clears the `access_token` cookie. Never requires a valid session, so a client can always log itself out.',
    }),
  );
}

export function ApiGetMe() {
  return applyDecorators(
    ApiUnauthorizedResponse({
      description: 'Missing, invalid, or expired session cookie.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: AuthResponseDto }),
    ApiOperation({ summary: 'Get the current authenticated user' }),
    ApiCookieAuth('access_token'),
  );
}

export function ApiUpdateMe() {
  return applyDecorators(
    ApiConflictResponse({
      description: 'newEmail already in use, or a concurrent update.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'A non-admin tried to change newEmail.',
      type: ErrorResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Wrong currentPassword, or no new field provided.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({
      description: 'Credentials updated.',
      type: AuthResponseDto,
    }),
    ApiOperation({
      summary: 'Update your own name, email, and/or password',
      description:
        'Requires `currentPassword` regardless of which field is changing. Only admins may change `newEmail`. Issues a fresh cookie reflecting the new credentials. Rate-limited to 10 requests/minute per IP.',
    }),
    ApiCookieAuth('access_token'),
  );
}
