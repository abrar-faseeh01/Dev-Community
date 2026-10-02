import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { POST_SORTS } from './dto/list-posts.dto';
import {
  DeletePostResponseDto,
  PostListResponseDto,
  PostResponseDto,
  PostSearchResponseDto,
} from './dto/post-response.dto';
import { UNAUTHORIZED_RESPONSE } from '../common/swagger/session-required';

const ID_PARAM = { name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7c0' };

const NOT_FOUND = {
  description: 'Post not found (or already soft-deleted).',
  type: ErrorResponseDto,
};

const FORBIDDEN = {
  description: "Caller is neither the post's author nor an admin.",
  type: ErrorResponseDto,
};

const CONFLICT = {
  description:
    'The post was modified concurrently by someone else (optimistic concurrency). Reload and retry.',
  type: ErrorResponseDto,
};

const ADMIN_CANNOT_CREATE = {
  description:
    'Administrator accounts cannot create posts (role check: only the `user` role may). Admins can still edit or delete any post.',
  type: ErrorResponseDto,
};

export function ApiCreatePost() {
  return applyDecorators(
    ApiForbiddenResponse(ADMIN_CANNOT_CREATE),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiCreatedResponse({ type: PostResponseDto }),
    ApiOperation({
      summary: 'Create a post',
      description:
        'Regular (`user`-role) accounts only. The author is always the authenticated caller — never client-supplied. Administrators get 403: they can moderate any post but cannot create one.',
    }),
    ApiCookieAuth('access_token'),
  );
}

export function ApiListPosts() {
  return applyDecorators(
    ApiBadRequestResponse({
      description:
        'Malformed cursor (bad encoding or not a valid post id), or a malformed authorId.',
      type: ErrorResponseDto,
    }),
    ApiQuery({
      name: 'authorId',
      required: false,
      description:
        'Only posts written by this user (a valid user id). Used for the "posts made by you" page.',
    }),
    ApiOkResponse({
      type: PostListResponseDto,
      description:
        'Requesting past the last page returns { items: [], nextCursor: null } rather than an error.',
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      enum: POST_SORTS,
      description:
        "Feed ordering: 'latest' (default), 'top' (ranked score) or 'discussed' (most comments). A cursor is only valid for the sort that produced it.",
    }),
    ApiQuery({
      name: 'cursor',
      required: false,
      description: "Previous response's nextCursor. Omit for the first page.",
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
    }),
    ApiOperation({
      summary: 'List posts (cursor-paginated feed)',
      description:
        "Public — no authentication required. Sorted newest-first by _id. Soft-deleted posts are excluded. When the request carries a valid session cookie, each post's `myReaction` is the caller's own reaction to it (looked up for the whole page in one query); otherwise it is null.",
    }),
  );
}

export function ApiSearchPosts() {
  return applyDecorators(
    ApiBadRequestResponse({
      description:
        'Missing, blank or whitespace-only `q`; `q` longer than 100 characters; `limit` outside 1-20 (rejected, not clamped); or any other query parameter.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({
      type: PostSearchResponseDto,
      description:
        'Zero matches returns { items: [], hasMore: false } rather than an error.',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
    }),
    ApiQuery({
      name: 'q',
      required: true,
      description: 'Words to search for. Trimmed; 1-100 characters.',
      schema: { type: 'string', minLength: 1, maxLength: 100 },
    }),
    ApiOperation({
      summary: 'Full-text search over posts',
      description:
        "Public — no authentication required. Matches whole words (stemmed) in title and body, best matches first; a title match outranks a body match. Returns at most `limit` results with no next page: `hasMore` says whether more matched. Zero matches is a normal 200 with an empty list. Soft-deleted posts are excluded. When the request carries a valid session cookie, each post's `myReaction` is the caller's own reaction; otherwise null. `rankScore` is always null here.",
    }),
  );
}

export function ApiGetPost() {
  return applyDecorators(
    ApiNotFoundResponse(NOT_FOUND),
    ApiOkResponse({ type: PostResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: 'Get a single post',
      description:
        "Public — no authentication required. A soft-deleted post 404s the same as a nonexistent one. When the request carries a valid session cookie, `myReaction` is the caller's own reaction to the post; otherwise it is null.",
    }),
  );
}

export function ApiUpdatePost() {
  return applyDecorators(
    ApiConflictResponse(CONFLICT),
    ApiNotFoundResponse(NOT_FOUND),
    ApiForbiddenResponse(FORBIDDEN),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiOkResponse({ type: PostResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: 'Update a post',
      description:
        "Owner-or-admin. Partial update — at least one of title/body is required. When an admin edits someone else's post, the change is audit-logged (identifying the post, not just the author) and the author is notified.",
    }),
    ApiCookieAuth('access_token'),
  );
}

export function ApiDeletePost() {
  return applyDecorators(
    ApiConflictResponse(CONFLICT),
    ApiNotFoundResponse(NOT_FOUND),
    ApiForbiddenResponse(FORBIDDEN),
    ApiUnauthorizedResponse(UNAUTHORIZED_RESPONSE),
    ApiOkResponse({ type: DeletePostResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: 'Delete a post (soft delete)',
      description:
        "Owner-or-admin. Sets deletedAt rather than removing the document — the post then 404s on every read route and never appears in the list. Its comments are soft-deleted along with it (their replies included), so they stop appearing in reads too. When an admin deletes someone else's post, it is audit-logged and the author is notified.",
    }),
    ApiCookieAuth('access_token'),
  );
}
