import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';
import { Post, PostSchema } from '../posts/schemas/post.schema';
import { ReactionsController } from './reactions.controller';
import { ReactionsService } from './reactions.service';
import { Reaction, ReactionSchema } from './schemas/reaction.schema';

@Module({
  imports: [
    // Post and Comment are registered here as well as in their own modules:
    // ReactionsService checks them and writes their counters directly (the
    // same arrangement CommentsModule has with Post), and registering a schema
    // twice just returns the same model.
    MongooseModule.forFeature([
      { name: Reaction.name, schema: ReactionSchema },
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
  ],
  controllers: [ReactionsController],
  providers: [ReactionsService],
  // Exported so the post and comment reads can attach the caller's own
  // reaction (a later step) without reaching into the Reaction schema.
  exports: [ReactionsService],
})
export class ReactionsModule {}
