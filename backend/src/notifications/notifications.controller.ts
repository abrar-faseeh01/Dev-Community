import { Controller, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from './notifications.service';

type RequestUser = { userId: string };

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findMine(@CurrentUser() requester: RequestUser) {
    return this.notificationsService.findForUser(requester.userId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() requester: RequestUser) {
    return this.notificationsService.unreadCount(requester.userId);
  }

  @Patch(':id/read')
  @HttpCode(200)
  markRead(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
  ) {
    return this.notificationsService.markRead(requester.userId, id);
  }
}
