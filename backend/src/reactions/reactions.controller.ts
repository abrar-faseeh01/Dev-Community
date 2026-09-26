import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestUser } from '../common/authorization/owner-or-admin';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ListReactorsQueryDto } from './dto/list-reactors-query.dto';
import {
  ReactionResponseDto,
  ReactorListResponseDto,
} from './dto/reaction-response.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { ReactionsService } from './reactions.service';

const UNAUTHORIZED = {
  description: 'Missing, invalid, or expired session cookie.',
  type: ErrorResponseDto,
};
const ADMIN_CANNOT_REACT = {
  description:
    'Administrator accounts cannot react (role check: only the `user` role may) — admins moderate, they do not participate.',
  type: ErrorResponseDto,
};

const TOGGLE_DESCRIPTION =
  "Regular (`user`-role) accounts only. One endpoint for every reaction change, decided by what the caller already has: no reaction → creates it; the same type again → removes it; the opposite type → switches it in place (one counter goes down and the other up). Not idempotent by design — sending the same request twice gives different results (react, then un-react). The response is the target's counters after the change plus the caller's own reaction (`myReaction`, null after a remove).";

const REACTORS_DESCRIPTION =
  "Public — no authentication required, the same as reading the post or comment itself. The most recent reactors first, at most 50, each as `{ user: { id, fullName, headline }, type }` (a deleted account is the \"Deleted user\" placeholder). `type` narrows the list to likes or dislikes. `likeCount` and `dislikeCount` are the target's true totals, unaffected by the filter or the cap.";

// No shared route prefix, the same as CommentsController: the two routes live
// under different resources (posts/:id, comments/:id), so each spells out its
// own full path.
//
// No @Public() — protected by the global JwtAuthGuard default — and
// @Roles('user'): the role is re-read from the database on every request, so
// an admin gets a 403 here before the body is even validated.
@ApiTags('reactions')
@Controller()
export class ReactionsController {
  constructor(private readonly reactionsService: ReactionsService) {}

  // 200, not 201: a toggle only sometimes creates something, so "created" would
  // be wrong for a remove or a switch. The service checks the post is live.

  // POST

  @Post('posts/:id/reaction')
  @Roles('user')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Like or dislike a post (toggle)',
    description: TOGGLE_DESCRIPTION,
  })
  @ApiParam({
    name: 'id',
    description: 'The post id.',
    example: '64f1c2e5a1b2c3d4e5f6a7b9',
  })
  @ApiOkResponse({ type: ReactionResponseDto })
  @ApiBadRequestResponse({
    description:
      'Malformed post id, a `type` other than `like` or `dislike`, or an unknown property in the body.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(ADMIN_CANNOT_REACT)
  @ApiNotFoundResponse({
    description: 'The post does not exist or has been deleted.',
    type: ErrorResponseDto,
  })
  togglePost(
    @Param('id', ParseObjectIdPipe) postId: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.reactionsService.togglePost(requester.userId, postId, dto.type);
  }

  // WHO REACTED — public reads. No @Roles and no cookie: whoever may read the
  // post or comment may see who reacted to it, and only name and headline of
  // each user leave the server (the same fields an author already exposes).

  @Public()
  @Get('posts/:id/reactions')
  @ApiOperation({
    summary: 'Who reacted to a post',
    description: REACTORS_DESCRIPTION,
  })
  @ApiParam({
    name: 'id',
    description: 'The post id.',
    example: '64f1c2e5a1b2c3d4e5f6a7b9',
  })
  @ApiOkResponse({ type: ReactorListResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed post id, a `type` other than `like` or `dislike`, or an unknown query parameter.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The post does not exist or has been deleted.',
    type: ErrorResponseDto,
  })
  listPostReactors(
    @Param('id', ParseObjectIdPipe) postId: string,
    @Query() query: ListReactorsQueryDto,
  ) {
    return this.reactionsService.listPostReactors(postId, query.type);
  }

  @Public()
  @Get('comments/:id/reactions')
  @ApiOperation({
    summary: 'Who reacted to a comment',
    description: REACTORS_DESCRIPTION,
  })
  @ApiParam({
    name: 'id',
    description: 'The comment id.',
    example: '64f1c2e5a1b2c3d4e5f6a7c0',
  })
  @ApiOkResponse({ type: ReactorListResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed comment id, a `type` other than `like` or `dislike`, or an unknown query parameter.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The comment does not exist or has been deleted.',
    type: ErrorResponseDto,
  })
  listCommentReactors(
    @Param('id', ParseObjectIdPipe) commentId: string,
    @Query() query: ListReactorsQueryDto,
  ) {
    return this.reactionsService.listCommentReactors(commentId, query.type);
  }

  // COMMENTS

  @Post('comments/:id/reaction')
  @Roles('user')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Like or dislike a comment (toggle)',
    description: TOGGLE_DESCRIPTION,
  })
  @ApiParam({
    name: 'id',
    description: 'The comment id.',
    example: '64f1c2e5a1b2c3d4e5f6a7c0',
  })
  @ApiOkResponse({ type: ReactionResponseDto })
  @ApiBadRequestResponse({
    description:
      'Malformed comment id, a `type` other than `like` or `dislike`, or an unknown property in the body.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(ADMIN_CANNOT_REACT)
  @ApiNotFoundResponse({
    description: 'The comment does not exist or has been deleted.',
    type: ErrorResponseDto,
  })
  toggleComment(
    @Param('id', ParseObjectIdPipe) commentId: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.reactionsService.toggleComment(
      requester.userId,
      commentId,
      dto.type,
    );
  }
}
