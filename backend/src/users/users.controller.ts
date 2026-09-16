import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { recordAdminOverride } from '../common/authorization/owner-or-admin';
import type { RequestUser } from '../common/authorization/owner-or-admin';
import { ReasonDto } from '../common/dto/reason.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateFullNameDto } from './dto/update-fullname.dto';
import { User } from './schemas/user.schema';
import { UsersService } from './users.service';

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

  // Admin-only, not owner-or-admin like the skills/experience routes (now
  // in ProfilesController): self-editing your own name already has a
  // dedicated, password-gated path (PATCH /auth/me — see
  // AuthService.updateCredentials). This route exists specifically for an
  // admin acting on someone else, so it deliberately doesn't offer a
  // weaker duplicate way to rename yourself without proving your password.
  @Patch(':id/fullname')
  @HttpCode(200)
  @Roles('admin')
  async updateFullName(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateFullNameDto,
  ) {
    if (requester.userId === id) {
      throw new ForbiddenException(
        'Use PATCH /auth/me to edit your own full name',
      );
    }

    const before = await this.usersService.getProfileById(id);
    const user = await this.usersService.updateFullName(id, dto.fullName);

    // Every successful call here is, by construction, an admin acting on
    // someone else (admin-only route, self-edits rejected above) — always
    // record, same as deleteUser above.
    await recordAdminOverride(
      { auditService: this.auditService, notificationsService: this.notificationsService },
      requester,
      { id, fullName: before.fullName },
      'update_fullname',
      { fullName: before.fullName },
      { fullName: user.fullName },
      dto.reason,
    );

    return this.toProfile(user);
  }

  // Hand-picked shape — never return the raw document. passwordHash is
  // already excluded by select:false and toJSON, but picking exact fields
  // here means nothing else on the document (however it evolves later)
  // can leak through by accident either.
  private toProfile(user: User) {
    return {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      skills: user.skills,
      experiences: user.experiences,
    };
  }
}
