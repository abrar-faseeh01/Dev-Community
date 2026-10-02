import { applyDecorators } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import {
  NotificationListResponseDto,
  NotificationResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';

export function ApiListMyNotifications() {
  return applyDecorators(
    ApiOkResponse({ type: NotificationListResponseDto }),
    ApiOperation({
      summary: 'List your own notifications',
      description: 'Newest first.',
    }),
  );
}

export function ApiGetUnreadCount() {
  return applyDecorators(
    ApiOkResponse({ type: UnreadCountResponseDto }),
    ApiOperation({ summary: 'Count your unread notifications' }),
  );
}

export function ApiMarkNotificationRead() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'Notification not found (or belongs to someone else).',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: NotificationResponseDto }),
    ApiParam({ name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7e0' }),
    ApiOperation({
      summary: 'Mark one of your notifications as read',
      description:
        "Scoped to the caller — a notificationId belonging to another user 404s, not 403, so existence of another user's notification is never revealed.",
    }),
  );
}
