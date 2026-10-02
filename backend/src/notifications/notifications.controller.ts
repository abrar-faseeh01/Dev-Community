import { Controller, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from './notifications.service';
import { ApiSessionRequired } from '../common/swagger/session-required';
import {
  ApiListMyNotifications,
  ApiGetUnreadCount,
  ApiMarkNotificationRead,
} from './notifications.swagger';

type RequestUser = { userId: string };

@ApiTags('notifications')
@ApiSessionRequired()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiListMyNotifications()
  findMine(@CurrentUser() requester: RequestUser) {
    return this.notificationsService.findForUser(requester.userId);
  }

  @Get('unread-count')
  @ApiGetUnreadCount()
  unreadCount(@CurrentUser() requester: RequestUser) {
    return this.notificationsService.unreadCount(requester.userId);
  }

  @Patch(':id/read')
  @HttpCode(200)
  @ApiMarkNotificationRead()
  markRead(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
  ) {
    return this.notificationsService.markRead(requester.userId, id);
  }
}
