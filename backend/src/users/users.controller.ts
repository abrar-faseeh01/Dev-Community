import { Body, Controller, Delete, Get, HttpCode, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestUser } from '../common/authorization/owner-or-admin';
import { ReasonDto } from '../common/dto/reason.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from './users.service';
import { ApiSessionRequired } from '../common/swagger/session-required';
import { ApiListUsers, ApiDeleteUser } from './users.swagger';

@ApiTags('users')
@ApiSessionRequired()
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
  @ApiListUsers()
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
  @ApiDeleteUser()
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
