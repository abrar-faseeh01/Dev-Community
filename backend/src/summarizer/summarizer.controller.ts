import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
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
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Model } from 'mongoose';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
// Aliased: `Post` is also the route decorator imported above.
import { Post as PostEntity } from '../posts/schemas/post.schema';
import { PostSummaryResponseDto } from './dto/summarize-response.dto';
import { SummarizerService } from './summarizer.service';

const UNAUTHORIZED = {
  description: 'Missing, invalid, or expired session cookie.',
  type: ErrorResponseDto,
};
const NOT_FOUND = {
  description: 'Post not found (or already soft-deleted).',
  type: ErrorResponseDto,
};

// No shared route prefix, the same as ReactionsController and
// CommentsController: the route belongs to the post resource, so it spells out
// its own full path (posts/:id/summarize) and is tagged 'posts' in Swagger.
//
// Any signed-in user, admins included (no @Roles): summarizing creates
// nothing, and an admin has the same reason to read a summary as anyone. Not
// @Public(), so the global JwtAuthGuard turns an anonymous caller away with
// 401 before the id is even looked at.
@ApiTags('posts')
@Controller()
export class SummarizerController {
  constructor(
    private readonly summarizerService: SummarizerService,
    @InjectModel(PostEntity.name) private readonly postModel: Model<PostEntity>,
  ) {}

  // POST because every call can spend model quota; 200 because nothing is
  // created.
  //
  // Order of checks: sign-in (401), id shape (400), post exists and is live
  // (404), then the length rules and the provider call inside the service. A
  // bad id, a missing post and a deleted post therefore never cost a model
  // call.
  //
  // The lookup selects title and body and nothing else, so the author and
  // every other field are never even loaded here, let alone passed on. The
  // caller is not read at all.
  //
  // 10 a minute per IP. Gemini's free quota is shared by the whole project,
  // not per user, so this cannot guarantee it is never exceeded; an upstream
  // 429 is mapped to 503 by the service. Day 18 tunes the number.
  @Post('posts/:id/summarize')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Summarize a post (summary text and skill tags)',
    description:
      "Any signed-in user, administrators included. Only the post's title and body are sent to the summarizer, never the author or the caller. With a model key configured the summary comes from Gemini (`source: 'gemini'`); otherwise from a deterministic extractive fallback (`source: 'mock'`), which is not real summarization. A body over 8000 characters is cut to its first 8000 and `truncated` is true. A body under 200 characters is rejected. Results are not stored: every call is computed fresh. The summary and tags are plain text and must be rendered as text.",
  })
  @ApiParam({
    name: 'id',
    description: 'The post id.',
    example: '64f1c2e5a1b2c3d4e5f6a7c0',
  })
  @ApiOkResponse({ type: PostSummaryResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed post id.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiUnprocessableEntityResponse({
    description:
      'The post body is under 200 characters, too short to summarize.',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'More than 10 summarize requests in a minute from one IP.',
    type: ErrorResponseDto,
  })
  @ApiBadGatewayResponse({
    description:
      'The summarizer answered with something unusable (not valid JSON, no summary, or no valid tags).',
    type: ErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description:
      'The summarizer is temporarily unavailable (unreachable, rate-limited or daily quota used up). Retrying right away may not help.',
    type: ErrorResponseDto,
  })
  @ApiGatewayTimeoutResponse({
    description: 'The summarizer took too long to respond.',
    type: ErrorResponseDto,
  })
  async summarize(@Param('id', ParseObjectIdPipe) id: string) {
    // deletedAt: null, the same live-post filter PostsService uses, so a
    // soft-deleted post 404s exactly like a missing one.
    const post = await this.postModel
      .findOne({ _id: id, deletedAt: null })
      .select('title body')
      .lean<{ title: string; body: string }>()
      .exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return this.summarizerService.summarize({
      title: post.title,
      body: post.body,
    });
  }
}
