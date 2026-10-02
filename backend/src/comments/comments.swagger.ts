import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import {
  CommentListResponseDto,
  CommentResponseDto,
  DeleteCommentResponseDto,
  EditCommentResponseDto,
} from './dto/comment-response.dto';
import { UNAUTHORIZED_RESPONSE } from '../common/swagger/session-required';

const POST_ID_PARAM = { name: 'postId', example: '64f1c2e5a1b2c3d4e5f6a7b9' };

const ADMIN_CANNOT_COMMENT = {
  description:
    'Administrator accounts cannot create comments (role check: only the `user` role may). Admins can still delete any comment.',
  type: ErrorResponseDto,
};

export function ApiListComments() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'The post does not exist or has been deleted.',
      type: ErrorResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Malformed post id.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: CommentListResponseDto }),
    ApiParam(POST_ID_PARAM),
    ApiOperation({
      summary: "List a post's comments as a tree",
      description:
        "Public — no authentication required. Returns every live comment on the post as a nested tree: top-level comments newest first, each with its full reply thread in `replies` (oldest first), nested up to a maximum depth of 2 — a reply deeper than that still appears in its root's `replies`, keeping its own true `parentCommentId`, rather than nesting further. Deleted comments and their replies are not included. There is no pagination, so the response grows with the number of comments on the post. When the request carries a valid session cookie, each comment's `myReaction` is the caller's own reaction to it (looked up for the whole thread in one query); otherwise it is null.",
    }),
  );
}

export function ApiCreateComment() {
  return applyDecorators(
    ApiNotFoundResponse({
      description:
        'The post does not exist or has been deleted, or the parent comment does not exist or has been deleted.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse(ADMIN_CANNOT_COMMENT),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiBadRequestResponse({
      description:
        'Malformed post id or parentCommentId; a blank, whitespace-only or over-2000-character body; an unknown property in the body; or a parent comment that belongs to a different post.',
      type: ErrorResponseDto,
    }),
    ApiCreatedResponse({ type: CommentResponseDto }),
    ApiParam(POST_ID_PARAM),
    ApiOperation({
      summary: 'Create a comment',
      description:
        "Regular (`user`-role) accounts only. Creates a top-level comment, or a reply when `parentCommentId` is given (omit it, or send null, for top level) — there is no separate reply endpoint. The post comes from the URL and the author is always the authenticated caller; neither is accepted in the body. A reply is accepted at any depth — there is no limit on how many times people may reply to each other; depth only affects how deep the returned tree nests (see GET), never whether a reply is allowed. Increments the post's `commentCount`.",
    }),
    ApiCookieAuth('access_token'),
  );
}

export function ApiUpdateComment() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'The comment does not exist or has been deleted.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: "The caller is not the comment's author.",
      type: ErrorResponseDto,
    }),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiBadRequestResponse({
      description:
        'Malformed comment id, or a blank, whitespace-only or over-2000-character body.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: EditCommentResponseDto }),
    ApiParam({ name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7c0' }),
    ApiOperation({
      summary: "Edit a comment's body",
      description:
        "Only the comment's own author may edit it — not an administrator, and not the author of the post it is on (unlike delete, this has no override). Nothing about the comment other than its body ever changes: not its post, not its parent, not who wrote it. `updatedAt` in the response is how a client detects an edit (compare it against `createdAt`); the value itself is not meant to be shown.",
    }),
    ApiCookieAuth('access_token'),
  );
}

export function ApiDeleteComment() {
  return applyDecorators(
    ApiNotFoundResponse({
      description:
        'The comment does not exist, was already deleted, or was deleted by a concurrent request.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description:
        "The caller is not the comment's author, not the author of the post it is on, and not an administrator.",
      type: ErrorResponseDto,
    }),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiBadRequestResponse({
      description: 'Malformed comment id.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: DeleteCommentResponseDto }),
    ApiParam({ name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7c0' }),
    ApiOperation({
      summary: 'Delete a comment and its replies (soft delete)',
      description:
        "Sets `deletedAt` on the comment and on every reply beneath it in one atomic operation — there is no placeholder left behind; the whole branch stops appearing in reads. Allowed for the comment's author, for the author of the post the comment is on, and for an administrator. `deletedCount` in the response is how many comments this call deleted (the comment plus its replies). Decrements the post's `commentCount` by that number. When an administrator deletes someone else's comment, the deletion is audit-logged (`delete_comment`, with the reason if one is given and how many comments went with it) and the comment's author is notified. A post's author removing a comment on their post is not audit-logged and does not notify anyone.",
    }),
    ApiCookieAuth('access_token'),
  );
}
