import { Controller, Get, HttpCode, Param, Patch } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  NotificationListResponseDto,
  NotificationResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

type RequestUser = { userId: string };

@ApiTags('notifications')
@ApiCookieAuth('access_token')
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired session cookie.', type: ErrorResponseDto })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List your own notifications', description: 'Newest first.' })
  @ApiOkResponse({ type: NotificationListResponseDto })
  findMine(@CurrentUser() requester: RequestUser) {
    return this.notificationsService.findForUser(requester.userId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count your unread notifications' })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  unreadCount(@CurrentUser() requester: RequestUser) {
    return this.notificationsService.unreadCount(requester.userId);
  }

  @Patch(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark one of your notifications as read', description: 'Scoped to the caller — a notificationId belonging to another user 404s, not 403, so existence of another user\'s notification is never revealed.' })
  @ApiParam({ name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7e0' })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiNotFoundResponse({ description: 'Notification not found (or belongs to someone else).', type: ErrorResponseDto })
  markRead(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
  ) {
    return this.notificationsService.markRead(requester.userId, id);
  }
}
