import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Model } from 'mongoose';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Post as PostEntity } from '../posts/schemas/post.schema';
import { SummarizerService } from './summarizer.service';
import { ApiSummarizePost } from './summarizer.swagger';

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
  @ApiSummarizePost()
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
