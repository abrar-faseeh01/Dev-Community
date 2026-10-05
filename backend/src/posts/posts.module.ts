import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { CommentsModule } from '../comments/comments.module';
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { Reaction, ReactionSchema } from '../reactions/schemas/reaction.schema';
import { PostPurgeService } from './post-purge.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { Post, PostSchema } from './schemas/post.schema';

@Module({
  imports: [
    // Comment and Reaction are registered here as well as in their own
    // modules, for PostPurgeService: it deletes them directly when it purges
    // an expired post. Registering a schema twice returns the same model.
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Reaction.name, schema: ReactionSchema },
    ]),
    AuditModule,
    NotificationsModule,
    // Deleting a post soft-deletes its comments. One direction only:
    // CommentsModule does not import this module.
    CommentsModule,
    // For the caller's own reaction on post reads (ReactionsService.findMineFor).
    // One direction only: ReactionsModule does not import this module.
    ReactionsModule,
  ],
  controllers: [PostsController],
  providers: [PostsService, PostPurgeService],
})
export class PostsModule {}
