import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  isAdminOverride,
  recordAdminOverride,
  type RequestUser,
} from '../common/authorization/owner-or-admin';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ReasonDto } from '../common/dto/reason.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { toOverrideTarget } from '../users/author-summary';
import { UsersService } from '../users/users.service';
import {
  assertMayDeleteComment,
  assertMayEditComment,
  isCommentAuthorOrAdmin,
} from './comment-permissions';
import { toCommentNode } from './comment-tree';
import { CommentsService } from './comments.service';
import {
  CommentListResponseDto,
  CommentResponseDto,
  DeleteCommentResponseDto,
  EditCommentResponseDto,
} from './dto/comment-response.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const POST_ID_PARAM = { name: 'postId', example: '64f1c2e5a1b2c3d4e5f6a7b9' };
const UNAUTHORIZED = {
  description: 'Missing, invalid, or expired session cookie.',
  type: ErrorResponseDto,
};
const ADMIN_CANNOT_COMMENT = {
  description:
    'Administrator accounts cannot create comments (role check: only the `user` role may). Admins can still delete any comment.',
  type: ErrorResponseDto,
};

// No shared route prefix: the comment routes live under two paths
// (posts/:postId/comments and comments/:id), so each handler spells out its
// own full path instead of inheriting one.
@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Public read, the same as the post it belongs to — someone who can see a
  // public post should see the discussion under it. The service's live-post
  // check means a soft-deleted post 404s here exactly like a nonexistent one.
  // The whole tree is returned as a bare array of top-level comments; the
  // global envelope already wraps it, and with no pagination there is no
  // cursor metadata to put alongside it.
  @Public()
  @Get('posts/:postId/comments')
  @ApiOperation({
    summary: 'List a post\'s comments as a tree',
    description:
      'Public — no authentication required. Returns every live comment on the post as a nested tree: top-level comments newest first, each with its full reply thread in `replies` (oldest first), nested up to a maximum depth of 2 — a reply deeper than that still appears in its root\'s `replies`, keeping its own true `parentCommentId`, rather than nesting further. Deleted comments and their replies are not included. There is no pagination, so the response grows with the number of comments on the post.',
  })
  @ApiParam(POST_ID_PARAM)
  @ApiOkResponse({ type: CommentListResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed post id.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The post does not exist or has been deleted.',
    type: ErrorResponseDto,
  })
  list(@Param('postId', ParseObjectIdPipe) postId: string) {
    return this.commentsService.list(postId);
  }

  // No @Public() — protected by the global JwtAuthGuard default.
  //
  // @Roles('user'): admins moderate (delete any comment) but do not author,
  // the same split as posts. The global RolesGuard rejects an admin with a 403
  // before the body is even validated, and the role is re-read from the
  // database on every request (JwtStrategy.validate), so it applies
  // immediately even to a cookie issued before someone was promoted.
  @Post('posts/:postId/comments')
  @Roles('user')
  @HttpCode(201)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Create a comment',
    description:
      'Regular (`user`-role) accounts only. Creates a top-level comment, or a reply when `parentCommentId` is given (omit it, or send null, for top level) — there is no separate reply endpoint. The post comes from the URL and the author is always the authenticated caller; neither is accepted in the body. A reply is accepted at any depth — there is no limit on how many times people may reply to each other; depth only affects how deep the returned tree nests (see GET), never whether a reply is allowed. Increments the post\'s `commentCount`.',
  })
  @ApiParam(POST_ID_PARAM)
  @ApiCreatedResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse({
    description:
      'Malformed post id or parentCommentId; a blank, whitespace-only or over-2000-character body; an unknown property in the body; or a parent comment that belongs to a different post.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(ADMIN_CANNOT_COMMENT)
  @ApiNotFoundResponse({
    description:
      'The post does not exist or has been deleted, or the parent comment does not exist or has been deleted.',
    type: ErrorResponseDto,
  })
  async create(
    @Param('postId', ParseObjectIdPipe) postId: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: CreateCommentDto,
  ) {
    const row = await this.commentsService.create(
      postId,
      requester.userId,
      dto,
    );
    // A new comment has no replies yet; toCommentNode gives it the same shape
    // the list route will return for every comment.
    return toCommentNode(row);
  }

  // Fetch first, then authorize — same scaffold as delete, reusing the same
  // findLiveById (an already-deleted comment 404s before authorization runs,
  // so a non-author learns nothing more than "it is not there"). Stricter
  // than delete, though: assertMayEditComment allows only the exact author —
  // no admin, no post's-author override. Nothing about the comment other
  // than its body can ever change through this route.
  @Patch('comments/:id')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Edit a comment\'s body',
    description:
      'Only the comment\'s own author may edit it — not an administrator, and not the author of the post it is on (unlike delete, this has no override). Nothing about the comment other than its body ever changes: not its post, not its parent, not who wrote it. `updatedAt` in the response is how a client detects an edit (compare it against `createdAt`); the value itself is not meant to be shown.',
  })
  @ApiParam({ name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7c0' })
  @ApiOkResponse({ type: EditCommentResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed comment id, or a blank, whitespace-only or over-2000-character body.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse({
    description: 'The caller is not the comment\'s author.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The comment does not exist or has been deleted.',
    type: ErrorResponseDto,
  })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateCommentDto,
  ) {
    const comment = await this.commentsService.findLiveById(id);
    assertMayEditComment(requester, String(comment.authorId));
    return this.commentsService.updateBody(id, dto.body);
  }

  // Fetch first, then authorize — the comment's author is only known after
  // the fetch, since :id is the comment. No @Roles: any signed-in account may
  // try, and assertMayDeleteComment decides. An already-deleted comment 404s
  // at the fetch, before authorization, so a caller who may not delete it
  // learns nothing more than "it is not there".
  //
  // Soft delete of the comment AND every reply beneath it, in one operation.
  // The response says how many rows that was.
  //
  // Only an ADMIN deleting someone else's comment is audit-logged and
  // notified (isAdminOverride). The author deleting their own comment, and a
  // post's author removing a comment on their own post, are silent: nothing
  // is recorded and the comment's author is not told. Order is deliberate:
  //   - everything that can fail for a reason unrelated to the delete (the
  //     post lookup, the comment author's account) is read BEFORE the write,
  //     so it cannot turn a completed delete into a 500;
  //   - the audit entry and the notification come AFTER the write and only
  //     because it succeeded. removeWithReplies throws a 404 when it changed
  //     nothing (a concurrent delete won), so a request that deleted nothing
  //     leaves no audit trail.
  @Delete('comments/:id')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Delete a comment and its replies (soft delete)',
    description:
      'Sets `deletedAt` on the comment and on every reply beneath it in one atomic operation — there is no placeholder left behind; the whole branch stops appearing in reads. Allowed for the comment\'s author, for the author of the post the comment is on, and for an administrator. `deletedCount` in the response is how many comments this call deleted (the comment plus its replies). Decrements the post\'s `commentCount` by that number. When an administrator deletes someone else\'s comment, the deletion is audit-logged (`delete_comment`, with the reason if one is given and how many comments went with it) and the comment\'s author is notified. A post\'s author removing a comment on their post is not audit-logged and does not notify anyone.',
  })
  @ApiParam({ name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7c0' })
  @ApiOkResponse({ type: DeleteCommentResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed comment id.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse({
    description:
      'The caller is not the comment\'s author, not the author of the post it is on, and not an administrator.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'The comment does not exist, was already deleted, or was deleted by a concurrent request.',
    type: ErrorResponseDto,
  })
  async remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: ReasonDto,
  ) {
    const comment = await this.commentsService.findLiveById(id);
    const commentAuthorId = String(comment.authorId);

    // The post lookup is the one extra read, so it only runs when the
    // requester is neither the author nor an admin.
    const postAuthorId = isCommentAuthorOrAdmin(requester, commentAuthorId)
      ? null
      : await this.commentsService.findPostAuthorId(comment.postId);
    assertMayDeleteComment(requester, commentAuthorId, postAuthorId);

    // Resolved before the write: who the audit entry and notification are
    // about. The account may have been deleted, in which case there is
    // nobody to notify and the entry is written under "Deleted user".
    const override = isAdminOverride(requester, commentAuthorId);
    const target = override
      ? toOverrideTarget(
          commentAuthorId,
          await this.usersService.findById(commentAuthorId),
        )
      : null;

    const result = await this.commentsService.removeWithReplies(comment);

    if (override && target) {
      await recordAdminOverride(
        {
          auditService: this.auditService,
          notificationsService: this.notificationsService,
        },
        requester,
        target,
        'delete_comment',
        { commentId: result.id, postId: String(comment.postId) },
        { deletedCount: result.deletedCount },
        'An administrator deleted your comment.',
        dto.reason,
      );
    }

    return result;
  }
}
