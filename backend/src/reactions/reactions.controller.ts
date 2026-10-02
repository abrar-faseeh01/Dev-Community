import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestUser } from '../common/authorization/owner-or-admin';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ListReactorsQueryDto } from './dto/list-reactors-query.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { ReactionsService } from './reactions.service';
import {
  ApiTogglePostReaction,
  ApiListPostReactors,
  ApiListCommentReactors,
  ApiToggleCommentReaction,
} from './reactions.swagger';

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
  @ApiTogglePostReaction()
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
  @ApiListPostReactors()
  listPostReactors(
    @Param('id', ParseObjectIdPipe) postId: string,
    @Query() query: ListReactorsQueryDto,
  ) {
    return this.reactionsService.listPostReactors(postId, query.type);
  }

  @Public()
  @Get('comments/:id/reactions')
  @ApiListCommentReactors()
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
  @ApiToggleCommentReaction()
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
