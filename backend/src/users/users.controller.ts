import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestUser } from '../common/authorization/owner-or-admin';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { NullDataResponseDto } from '../common/dto/null-data-response.dto';
import { ReasonDto } from '../common/dto/reason.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersListResponseDto } from './dto/users-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth('access_token')
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired session cookie.', type: ErrorResponseDto })
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Must come before ':id' — otherwise Nest would try to match "users" as
  // an :id param and 400 on ParseObjectIdPipe.
  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiOkResponse({ type: UsersListResponseDto })
  @ApiForbiddenResponse({ description: 'Caller is not an admin.', type: ErrorResponseDto })
  async listUsers() {
    const users = await this.usersService.findAll();
    return users.map((user) => ({
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      createdAt: (user as unknown as { createdAt: Date }).createdAt,
    }));
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently delete a user (admin only)', description: 'Hard delete — not soft delete. Admin accounts cannot be deleted through this route, including by themselves.' })
  @ApiParam({ name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7b8' })
  @ApiOkResponse({ type: NullDataResponseDto })
  @ApiForbiddenResponse({ description: 'Caller is not an admin, or the target is an admin account.', type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'User not found.', type: ErrorResponseDto })
  async deleteUser(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: ReasonDto,
  ) {
    const deleted = await this.usersService.deleteUser(id);
    // A successful delete here is always an admin acting on someone else —
    // this endpoint requires admin (@Roles above), and the service already
    // refuses to delete any admin account (including the requester's own,
    // since only an admin could ever successfully target themselves here).
    // So there's no self-delete case to exclude, unlike the routes below.
    await this.auditService.log({
      adminId: requester.userId,
      adminFullName: requester.fullName,
      targetUserId: id,
      targetFullName: deleted.fullName,
      action: 'delete_user',
      previousState: {
        fullName: deleted.fullName,
        email: deleted.email,
        role: deleted.role,
      },
      newState: null,
      reason: dto.reason,
    });
    // No notification — the account (and anyone to notify) no longer exists.
    return null;
  }

}
