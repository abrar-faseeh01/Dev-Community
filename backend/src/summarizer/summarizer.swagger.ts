import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiGatewayTimeoutResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { PostSummaryResponseDto } from './dto/summarize-response.dto';
import { UNAUTHORIZED_RESPONSE } from '../common/swagger/session-required';

const NOT_FOUND = {
  description: 'Post not found (or already soft-deleted).',
  type: ErrorResponseDto,
};

export function ApiSummarizePost() {
  return applyDecorators(
    ApiGatewayTimeoutResponse({
      description: 'The summarizer took too long to respond.',
      type: ErrorResponseDto,
    }),
    ApiServiceUnavailableResponse({
      description:
        'The summarizer is temporarily unavailable (unreachable, rate-limited or daily quota used up). Retrying right away may not help.',
      type: ErrorResponseDto,
    }),
    ApiBadGatewayResponse({
      description:
        'The summarizer answered with something unusable (not valid JSON, no summary, or no valid tags).',
      type: ErrorResponseDto,
    }),
    ApiTooManyRequestsResponse({
      description: 'More than 10 summarize requests in a minute from one IP.',
      type: ErrorResponseDto,
    }),
    ApiUnprocessableEntityResponse({
      description:
        'The post body is under 200 characters, too short to summarize.',
      type: ErrorResponseDto,
    }),
    ApiNotFoundResponse(NOT_FOUND),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiBadRequestResponse({
      description: 'Malformed post id.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: PostSummaryResponseDto }),
    ApiParam({
      name: 'id',
      description: 'The post id.',
      example: '64f1c2e5a1b2c3d4e5f6a7c0',
    }),
    ApiOperation({
      summary: 'Summarize a post (summary text and skill tags)',
      description:
        "Any signed-in user, administrators included. Only the post's title and body are sent to the summarizer, never the author or the caller. With a model key configured the summary comes from Gemini (`source: 'gemini'`); otherwise from a deterministic extractive fallback (`source: 'mock'`), which is not real summarization. A body over 8000 characters is cut to its first 8000 and `truncated` is true. A body under 200 characters is rejected. Results are not stored: every call is computed fresh. The summary and tags are plain text and must be rendered as text.",
    }),
    ApiCookieAuth('access_token'),
  );
}
