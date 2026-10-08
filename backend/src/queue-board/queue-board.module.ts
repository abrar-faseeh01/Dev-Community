import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { createQueueBoardGuard } from './queue-board.guard';

export const QUEUE_BOARD_ROUTE = '/admin/queues';

// The Bull Board dashboard. Each queue shows up here by registering itself
// with BullBoardModule.forFeature(...) in its own module (see MailModule).
@Module({
  imports: [
    BullBoardModule.forRootAsync({
      imports: [UsersModule],
      inject: [ConfigService, UsersService],
      useFactory: (config: ConfigService, users: UsersService) => ({
        route: QUEUE_BOARD_ROUTE,
        adapter: ExpressAdapter,
        middleware: createQueueBoardGuard({
          enabled: config.getOrThrow<boolean>('BULL_BOARD_ENABLED'),
          // Same secret and expiry rules as the access token the API issues.
          jwt: new JwtService({
            secret: config.getOrThrow<string>('JWT_SECRET'),
          }),
          users,
        }),
      }),
    }),
  ],
})
export class QueueBoardModule {}
