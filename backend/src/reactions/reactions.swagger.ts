import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import {
  ReactionResponseDto,
  ReactorListResponseDto,
} from './dto/reaction-response.dto';
import { UNAUTHORIZED_RESPONSE } from '../common/swagger/session-required';

const ADMIN_CANNOT_REACT = {
  description:
    'Administrator accounts cannot react (role check: only the `user` role may) — admins moderate, they do not participate.',
  type: ErrorResponseDto,
};

const TOGGLE_DESCRIPTION =
  "Regular (`user`-role) accounts only. One endpoint for every reaction change, decided by what the caller already has: no reaction → creates it; the same type again → removes it; the opposite type → switches it in place (one counter goes down and the other up). Not idempotent by design — sending the same request twice gives different results (react, then un-react). The response is the target's counters after the change plus the caller's own reaction (`myReaction`, null after a remove).";

const REACTORS_DESCRIPTION =
  'Public — no authentication required, the same as reading the post or comment itself. The most recent reactors first, at most 50, each as `{ user: { id, fullName, headline }, type }` (a deleted account is the "Deleted user" placeholder). `type` narrows the list to likes or dislikes. `likeCount` and `dislikeCount` are the target\'s true totals, unaffected by the filter or the cap.';

export function ApiTogglePostReaction() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'The post does not exist or has been deleted.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse(ADMIN_CANNOT_REACT),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiBadRequestResponse({
      description:
        'Malformed post id, a `type` other than `like` or `dislike`, or an unknown property in the body.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: ReactionResponseDto }),
    ApiParam({
      name: 'id',
      description: 'The post id.',
      example: '64f1c2e5a1b2c3d4e5f6a7b9',
    }),
    ApiOperation({
      summary: 'Like or dislike a post (toggle)',
      description: TOGGLE_DESCRIPTION,
    }),
    ApiCookieAuth('access_token'),
  );
}

export function ApiListPostReactors() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'The post does not exist or has been deleted.',
      type: ErrorResponseDto,
    }),
    ApiBadRequestResponse({
      description:
        'Malformed post id, a `type` other than `like` or `dislike`, or an unknown query parameter.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: ReactorListResponseDto }),
    ApiParam({
      name: 'id',
      description: 'The post id.',
      example: '64f1c2e5a1b2c3d4e5f6a7b9',
    }),
    ApiOperation({
      summary: 'Who reacted to a post',
      description: REACTORS_DESCRIPTION,
    }),
  );
}

export function ApiListCommentReactors() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'The comment does not exist or has been deleted.',
      type: ErrorResponseDto,
    }),
    ApiBadRequestResponse({
      description:
        'Malformed comment id, a `type` other than `like` or `dislike`, or an unknown query parameter.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: ReactorListResponseDto }),
    ApiParam({
      name: 'id',
      description: 'The comment id.',
      example: '64f1c2e5a1b2c3d4e5f6a7c0',
    }),
    ApiOperation({
      summary: 'Who reacted to a comment',
      description: REACTORS_DESCRIPTION,
    }),
  );
}

export function ApiToggleCommentReaction() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'The comment does not exist or has been deleted.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse(ADMIN_CANNOT_REACT),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiBadRequestResponse({
      description:
        'Malformed comment id, a `type` other than `like` or `dislike`, or an unknown property in the body.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: ReactionResponseDto }),
    ApiParam({
      name: 'id',
      description: 'The comment id.',
      example: '64f1c2e5a1b2c3d4e5f6a7c0',
    }),
    ApiOperation({
      summary: 'Like or dislike a comment (toggle)',
      description: TOGGLE_DESCRIPTION,
    }),
    ApiCookieAuth('access_token'),
  );
}
