import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Post, PostSchema } from '../posts/schemas/post.schema';
import { UsersModule } from '../users/users.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { Comment, CommentSchema } from './schemas/comment.schema';

@Module({
  imports: [
    // Post is registered here as well as in PostsModule: CommentsService
    // reads and updates it directly (see the note on its constructor), and
    // registering the same schema twice just returns the same model.
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: Post.name, schema: PostSchema },
    ]),
    // For an admin deleting someone else's comment: the comment author's
    // name for the audit entry, the audit log itself, and the notification.
    UsersModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  // Exported for the cascade that deletes a post's comments along with it.
  exports: [CommentsService],
})
export class CommentsModule {}
