import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { CommentsModule } from '../comments/comments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { Post, PostSchema } from './schemas/post.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
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
  providers: [PostsService],
})
export class PostsModule {}
