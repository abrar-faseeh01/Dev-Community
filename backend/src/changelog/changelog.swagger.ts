import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiGatewayTimeoutResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import {
  ChangelogListResponseDto,
  ChangelogSyncResponseDto,
} from './dto/changelog-response.dto';

export function ApiListChangelog() {
  return applyDecorators(
    ApiOkResponse({ type: ChangelogListResponseDto }),
    ApiOperation({
      summary: 'List stored changelog entries',
      description:
        'Newest merged first, at most 50. Reads only the database and never calls GitHub, so it works while GitHub is down.',
    }),
  );
}

export function ApiSyncChangelog() {
  return applyDecorators(
    ApiGatewayTimeoutResponse({
      description: 'GitHub took too long (`GITHUB_TIMEOUT`).',
      type: ErrorResponseDto,
    }),
    ApiServiceUnavailableResponse({
      description:
        'GitHub is unreachable (`GITHUB_UNAVAILABLE`) or its rate limit is reached (`GITHUB_RATE_LIMITED`).',
      type: ErrorResponseDto,
    }),
    ApiBadGatewayResponse({
      description:
        "The server's GitHub App was refused (`GITHUB_AUTH_FAILED`, `GITHUB_FORBIDDEN`). Not the caller's session.",
      type: ErrorResponseDto,
    }),
    ApiNotFoundResponse({
      description:
        'Repository not found, or the App is not installed on it (`REPO_NOT_FOUND`).',
      type: ErrorResponseDto,
    }),
    ApiTooManyRequestsResponse({
      description: 'More than 5 sync requests in a minute from one IP.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is not an admin.',
      type: ErrorResponseDto,
    }),
    ApiBadRequestResponse({
      description: '`repo` is not in `owner/repo` form.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: ChangelogSyncResponseDto }),
    ApiOperation({
      summary: 'Sync the last PR merged into main (admin only)',
      description:
        'Fetches the most recently merged PR into `main` for one repository and upserts it (syncing the same PR twice leaves one entry). On any failure nothing is written and existing entries are untouched. Failure bodies use the standard envelope; the message is fixed text per failure and never contains a token, key or GitHub response. Without GitHub App credentials the server uses a fixed mock PR.',
    }),
  );
}
