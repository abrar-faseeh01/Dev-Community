import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
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
    // Shows this queue in the dashboard (see QueueBoardModule).
    BullBoardModule.forFeature({ name: MAIL_QUEUE, adapter: BullMQAdapter }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [MailService, MailProcessor],
  // BullModule is exported so a module importing MailModule can inject the
  // queue (AuthService does, in the next step).
  exports: [MailService, BullModule],
})
export class MailModule {}
