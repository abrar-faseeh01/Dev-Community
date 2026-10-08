import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MAIL_QUEUE } from './mail.constants';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: MAIL_QUEUE }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [MailService, MailProcessor],
  // BullModule is exported so a module importing MailModule can inject the
  // queue (AuthService does, in the next step).
  exports: [MailService, BullModule],
})
export class MailModule {}
