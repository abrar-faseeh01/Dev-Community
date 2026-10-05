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
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  assertOwnerOrAdmin,
  isAdminOverride,
  recordAdminOverride,
  type RequestUser,
} from '../common/authorization/owner-or-admin';
import { ReasonDto } from '../common/dto/reason.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { displayCount } from '../reactions/reaction-toggle';
import { ReactionsService } from '../reactions/reactions.service';
import type { ReactionType } from '../reactions/schemas/reaction.schema';
import { toAuthorSummary, toOverrideTarget } from '../users/author-summary';
import { CreatePostDto } from './dto/create-post.dto';
import { ListPostsDto } from './dto/list-posts.dto';
import { SearchPostsDto } from './dto/search-posts.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService, PostWithAuthor } from './posts.service';
import {
  ApiCreatePost,
  ApiDeletePost,
  ApiGetPost,
  ApiListPosts,
  ApiSearchPosts,
  ApiUpdatePost,
} from './posts.swagger';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly reactionsService: ReactionsService,
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
  @ApiCreatePost()
  async create(
    @CurrentUser() requester: RequestUser,
    @Body() dto: CreatePostDto,
  ) {
    const post = await this.postsService.create(requester.userId, dto);
    // A post that was just created cannot have a reaction yet.
    return this.toPostResponse(post, null);
  }

  // Public read, same reasoning as findById below. 0 path segments after
  // /posts vs. :id's required 1 segment — no route-ordering ambiguity with
  // findById the way ProfilesController's 'me' vs ':id' has, but list()
  // is declared first anyway as the more fundamental route.
  //
  // @UseGuards(OptionalJwtAuthGuard): still public, but a signed-in caller is
  // identified so each post can carry their own reaction (`myReaction`). An
  // anonymous caller, or one with a bad cookie, is not rejected — they get
  // `myReaction: null` on every post. Without this guard the global one
  // skips authentication on @Public() routes and request.user is never set.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @ApiListPosts()
  async list(
    @Query() dto: ListPostsDto,
    @CurrentUser() requester: RequestUser | null,
  ) {
    const { items, nextCursor } = await this.postsService.list(
      dto.limit,
      dto.cursor,
      dto.authorId,
      dto.sort ?? 'latest',
    );
    // One query for the whole page, not one per post.
    const mine = await this.reactionsService.findMineFor(
      requester?.userId ?? null,
      'post',
      items.map((post) => String(post._id)),
    );
    return {
      items: items.map((post) =>
        this.toPostResponse(post, mine.get(String(post._id)) ?? null),
      ),
      nextCursor,
    };
  }

  // Declared before GET ':id' so the literal 'search' segment is matched here
  // and not read as a post id.
  //
  // 40 a minute per IP is a judgment call: text search is the most expensive
  // query in this controller, but a debounced search box fires a request per
  // pause in typing, and 20 a minute is easy to reach in ordinary use. Reviewed
  // on Day 18 and kept: there is no real usage data to justify another number.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('search')
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  @ApiSearchPosts()
  async search(
    @Query() dto: SearchPostsDto,
    @CurrentUser() requester: RequestUser | null,
  ) {
    const { items, hasMore } = await this.postsService.search(dto.q, dto.limit);
    // One query for the whole result, not one per post.
    const mine = await this.reactionsService.findMineFor(
      requester?.userId ?? null,
      'post',
      items.map((post) => String(post._id)),
    );
    return {
      items: items.map((post) =>
        this.toPostResponse(post, mine.get(String(post._id)) ?? null),
      ),
      hasMore,
    };
  }

  // Public read — a developer-community feed should be browsable without
  // an account. The service's deletedAt: null filter means a soft-deleted
  // post 404s here exactly like a nonexistent one (nothing to test that
  // against yet — no delete endpoint until step 9).
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiGetPost()
  async findById(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser | null,
  ) {
    const post = await this.postsService.findById(id);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    const mine = await this.reactionsService.findMineFor(
      requester?.userId ?? null,
      'post',
      [id],
    );
    return this.toPostResponse(post, mine.get(id) ?? null);
  }

  // Fetch first, unconditionally, then authorize — unlike ProfilesController
  // where :id already is the target user id, here :id is the post id, so
  // authorId is only known after the fetch. Admin-moderation: self-edit
  // (isAdminOverride false) produces neither an audit entry nor a
  // notification, exactly as before this step.
  @Patch(':id')
  @HttpCode(200)
  @ApiUpdatePost()
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
        {
          auditService: this.auditService,
          notificationsService: this.notificationsService,
        },
        requester,
        toOverrideTarget(authorId, updated.authorId),
        'update_post',
        { postId: String(post._id), title: previousTitle },
        { postId: String(post._id), title: updated.title },
        'An administrator updated your post.',
        dto.reason,
      );
    }

    // The edit response is the full post, so it carries the caller's own
    // reaction too — an author editing their post keeps seeing what they gave it.
    const mine = await this.reactionsService.findMineFor(
      requester.userId,
      'post',
      [id],
    );
    return this.toPostResponse(updated, mine.get(id) ?? null);
  }

  // Same fetch-then-authorize scaffold as update above, reused unchanged.
  // Soft delete only — findRawById's deletedAt: null filter means an
  // already-deleted post 404s here exactly like a nonexistent one, before
  // authorization even runs. Response is deliberately not the full
  // toPostResponse shape — title/body/author aren't meaningful to hand
  // back for a delete.
  @Delete(':id')
  @HttpCode(200)
  @ApiDeletePost()
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
        {
          auditService: this.auditService,
          notificationsService: this.notificationsService,
        },
        requester,
        toOverrideTarget(authorId, removed.authorId),
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
  // (toAuthorSummary) so nothing else on User (email, role, anything added
  // later) can leak through by accident. An author whose account has been
  // deleted comes back as a placeholder of the same shape.
  private toPostResponse(
    post: PostWithAuthor,
    myReaction: ReactionType | null,
  ) {
    return {
      id: String(post._id),
      title: post.title,
      body: post.body,
      likeCount: displayCount(post.likeCount),
      dislikeCount: displayCount(post.dislikeCount),
      commentCount: post.commentCount,
      myReaction,
      rankScore: post.score ?? null,
      deletedAt: post.deletedAt,
      createdAt: (post as unknown as { createdAt: Date }).createdAt,
      updatedAt: (post as unknown as { updatedAt: Date }).updatedAt,
      author: toAuthorSummary(post.authorId),
    };
  }
}
