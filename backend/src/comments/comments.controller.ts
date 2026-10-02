import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  isAdminOverride,
  recordAdminOverride,
  type RequestUser,
} from '../common/authorization/owner-or-admin';
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
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  ApiListComments,
  ApiCreateComment,
  ApiUpdateComment,
  ApiDeleteComment,
} from './comments.swagger';

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
  //
  // @UseGuards(OptionalJwtAuthGuard): still public, but a signed-in caller is
  // identified so every comment can carry their own reaction (`myReaction`).
  // Anonymous or bad-cookie callers are not rejected; they get null throughout.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('posts/:postId/comments')
  @ApiListComments()
  list(
    @Param('postId', ParseObjectIdPipe) postId: string,
    @CurrentUser() requester: RequestUser | null,
  ) {
    return this.commentsService.list(postId, requester?.userId ?? null);
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
  @ApiCreateComment()
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
  @ApiUpdateComment()
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
  @ApiDeleteComment()
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
