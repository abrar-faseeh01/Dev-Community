import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  // UsersModule re-exports MongooseModule (with the User feature already
  // registered) specifically so a sibling module can @InjectModel(User.name)
  // without a second forFeature() call for the same schema/connection.
  // AuditModule/NotificationsModule are needed by the owner-or-admin write
  // routes below, which record admin-override actions the same way
  // UsersController does.
  imports: [UsersModule, AuditModule, NotificationsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
