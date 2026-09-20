import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  assertOwnerOrAdmin,
  isAdminOverride,
  recordAdminOverride,
  type RequestUser,
} from '../common/authorization/owner-or-admin';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ReasonDto } from '../common/dto/reason.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ListPostsDto } from './dto/list-posts.dto';
import {
  DeletePostResponseDto,
  PostListResponseDto,
  PostResponseDto,
} from './dto/post-response.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService, PostWithAuthor } from './posts.service';

const ID_PARAM = { name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7c0' };
const NOT_FOUND = { description: 'Post not found (or already soft-deleted).', type: ErrorResponseDto };
const FORBIDDEN = { description: 'Caller is neither the post\'s author nor an admin.', type: ErrorResponseDto };
const CONFLICT = {
  description: 'The post was modified concurrently by someone else (optimistic concurrency). Reload and retry.',
  type: ErrorResponseDto,
};
const UNAUTHORIZED = { description: 'Missing, invalid, or expired session cookie.', type: ErrorResponseDto };
const ADMIN_CANNOT_CREATE = {
  description: 'Administrator accounts cannot create posts (role check: only the `user` role may). Admins can still edit or delete any post.',
  type: ErrorResponseDto,
};

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // No @Public() — protected by the global JwtAuthGuard default. The
  // creator is trivially the author, so there's no ownership branching
  // here the way there is on update/delete.
  //
  // @Roles('user'): admins moderate posts (edit/delete any of them) but do
  // not author them, so the rule lives here in the API rather than only in
  // the UI hiding the button. The global RolesGuard rejects an admin with a
  // 403 before the body is even validated. The role is re-read from the
  // database on every request (JwtStrategy.validate), so this applies
  // immediately even to a cookie issued before someone was promoted.
  @Post()
  @Roles('user')
  @HttpCode(201)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Create a post',
    description: 'Regular (`user`-role) accounts only. The author is always the authenticated caller — never client-supplied. Administrators get 403: they can moderate any post but cannot create one.',
  })
  @ApiCreatedResponse({ type: PostResponseDto })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(ADMIN_CANNOT_CREATE)
  async create(
    @CurrentUser() requester: RequestUser,
    @Body() dto: CreatePostDto,
  ) {
    const post = await this.postsService.create(requester.userId, dto);
    return this.toPostResponse(post);
  }

  // Public read, same reasoning as findById below. 0 path segments after
  // /posts vs. :id's required 1 segment — no route-ordering ambiguity with
  // findById the way ProfilesController's 'me' vs ':id' has, but list()
  // is declared first anyway as the more fundamental route.
  @Public()
  @Get()
  @ApiOperation({
    summary: 'List posts (cursor-paginated feed)',
    description: 'Public — no authentication required. Sorted newest-first by _id. Soft-deleted posts are excluded.',
  })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Previous response\'s nextCursor. Omit for the first page.' })
  @ApiOkResponse({
    type: PostListResponseDto,
    description: 'Requesting past the last page returns { items: [], nextCursor: null } rather than an error.',
  })
  @ApiBadRequestResponse({ description: 'Malformed cursor (bad encoding or not a valid post id).', type: ErrorResponseDto })
  async list(@Query() dto: ListPostsDto) {
    const { items, nextCursor } = await this.postsService.list(
      dto.limit,
      dto.cursor,
    );
    return { items: items.map((post) => this.toPostResponse(post)), nextCursor };
  }

  // Public read — a developer-community feed should be browsable without
  // an account. The service's deletedAt: null filter means a soft-deleted
  // post 404s here exactly like a nonexistent one (nothing to test that
  // against yet — no delete endpoint until step 9).
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single post', description: 'Public — no authentication required. A soft-deleted post 404s the same as a nonexistent one.' })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: PostResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async findById(@Param('id', ParseObjectIdPipe) id: string) {
    const post = await this.postsService.findById(id);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return this.toPostResponse(post);
  }

  // Fetch first, unconditionally, then authorize — unlike ProfilesController
  // where :id already is the target user id, here :id is the post id, so
  // authorId is only known after the fetch. Admin-moderation: self-edit
  // (isAdminOverride false) produces neither an audit entry nor a
  // notification, exactly as before this step.
  @Patch(':id')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Update a post',
    description: 'Owner-or-admin. Partial update — at least one of title/body is required. When an admin edits someone else\'s post, the change is audit-logged (identifying the post, not just the author) and the author is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: PostResponseDto })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdatePostDto,
  ) {
    const post = await this.postsService.findRawById(id);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    // Captured once, before applyUpdate — it calls .populate('authorId', ...)
    // on this same object in place, so a String(post.authorId) taken after
    // that call would stringify the populated {_id, fullName, headline}
    // object instead of the hex id (the same ObjectId-vs-string trap,
    // triggered by mutation rather than a fresh fetch). previousTitle is
    // captured for the same reason — applyUpdate mutates title too.
    const authorId = String(post.authorId);
    assertOwnerOrAdmin(requester, authorId, 'post');
    const previousTitle = post.title;
    const updated = await this.postsService.applyUpdate(post, dto);

    if (isAdminOverride(requester, authorId)) {
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
        requester,
        { id: authorId, fullName: updated.authorId.fullName },
        'update_post',
        { postId: String(post._id), title: previousTitle },
        { postId: String(post._id), title: updated.title },
        'An administrator updated your post.',
        dto.reason,
      );
    }

    return this.toPostResponse(updated);
  }

  // Same fetch-then-authorize scaffold as update above, reused unchanged.
  // Soft delete only — findRawById's deletedAt: null filter means an
  // already-deleted post 404s here exactly like a nonexistent one, before
  // authorization even runs. Response is deliberately not the full
  // toPostResponse shape — title/body/author aren't meaningful to hand
  // back for a delete.
  @Delete(':id')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Delete a post (soft delete)',
    description: 'Owner-or-admin. Sets deletedAt rather than removing the document — the post then 404s on every read route and never appears in the list. When an admin deletes someone else\'s post, it is audit-logged and the author is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: DeletePostResponseDto })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  async remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: ReasonDto,
  ) {
    const post = await this.postsService.findRawById(id);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    // Same capture-before-mutation reasoning as update above — remove()
    // also populates authorId on this same object in place.
    const authorId = String(post.authorId);
    assertOwnerOrAdmin(requester, authorId, 'post');
    const title = post.title;
    const removed = await this.postsService.remove(post);

    if (isAdminOverride(requester, authorId)) {
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
        requester,
        { id: authorId, fullName: removed.authorId.fullName },
        'delete_post',
        { postId: String(post._id), title },
        null,
        'An administrator deleted your post.',
        dto.reason,
      );
    }

    return { id: String(removed._id), deletedAt: removed.deletedAt };
  }

  // Hand-picked shape, same reasoning as ProfilesController.toProfileResponse
  // — never spread the raw document (no __v, no bare authorId ObjectId),
  // and the populated author is narrowed to exactly {id, fullName, headline}
  // so nothing else on User (email, role, anything added later) can leak
  // through by accident.
  private toPostResponse(post: PostWithAuthor) {
    return {
      id: String(post._id),
      title: post.title,
      body: post.body,
      likeCount: post.likeCount,
      dislikeCount: post.dislikeCount,
      commentCount: post.commentCount,
      deletedAt: post.deletedAt,
      createdAt: (post as unknown as { createdAt: Date }).createdAt,
      updatedAt: (post as unknown as { updatedAt: Date }).updatedAt,
      author: {
        id: String(post.authorId._id),
        fullName: post.authorId.fullName,
        headline: post.authorId.headline,
      },
    };
  }
}
