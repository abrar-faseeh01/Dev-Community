import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { AddExperienceDto } from './dto/add-experience.dto';
import { ReasonDto } from './dto/reason.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { UpdateFullNameDto } from './dto/update-fullname.dto';
import { UpdateSkillsDto } from './dto/update-skills.dto';
import { User } from './schemas/user.schema';
import { UsersService } from './users.service';

type RequestUser = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
};

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

  // No @Public() — protected by the global default, per the design
  // decision that viewing a profile requires being logged in (any
  // authenticated user may view any profile; a logged-out visitor may not).
  @Get(':id')
  async getProfile(@Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.usersService.getProfileById(id);
    return this.toProfile(user);
  }

  @Patch(':id/skills')
  @HttpCode(200)
  async updateSkills(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateSkillsDto,
  ) {
    this.assertOwnerOrAdmin(requester, id);
    const isOverride = this.isAdminOverride(requester, id);
    const before = isOverride ? await this.usersService.getProfileById(id) : null;

    const user = await this.usersService.updateSkills(id, dto.skills);

    if (isOverride) {
      await this.recordAdminOverride(
        requester,
        { id, fullName: user.fullName },
        'update_skills',
        { skills: before!.skills },
        { skills: user.skills },
        dto.reason,
      );
    }
    return this.toProfile(user);
  }

  // Admin-only, not owner-or-admin like the routes around it: self-editing
  // your own name already has a dedicated, password-gated path
  // (PATCH /auth/me — see AuthService.updateCredentials). This route exists
  // specifically for an admin acting on someone else, so it deliberately
  // doesn't offer a weaker duplicate way to rename yourself without
  // proving your password.
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
    await this.recordAdminOverride(
      requester,
      { id, fullName: before.fullName },
      'update_fullname',
      { fullName: before.fullName },
      { fullName: user.fullName },
      dto.reason,
    );

    return this.toProfile(user);
  }

  @Post(':id/experiences')
  @HttpCode(201)
  async addExperience(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: AddExperienceDto,
  ) {
    this.assertOwnerOrAdmin(requester, id);
    const isOverride = this.isAdminOverride(requester, id);
    const { reason, ...experienceData } = dto;

    const user = await this.usersService.addExperience(id, experienceData);

    if (isOverride) {
      // $push appends — the just-added entry is always the last element.
      const added = user.experiences[user.experiences.length - 1];
      await this.recordAdminOverride(
        requester,
        { id, fullName: user.fullName },
        'add_experience',
        null,
        {
          title: added.title,
          company: added.company,
          from: added.from,
          to: added.to,
          description: added.description,
        },
        reason,
      );
    }
    return this.toProfile(user);
  }

  @Patch(':id/experiences/:experienceId')
  @HttpCode(200)
  async updateExperience(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('experienceId', ParseObjectIdPipe) experienceId: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateExperienceDto,
  ) {
    this.assertOwnerOrAdmin(requester, id);
    const isOverride = this.isAdminOverride(requester, id);
    const { reason, ...updateFields } = dto;

    const before = isOverride ? await this.usersService.getProfileById(id) : null;
    const previousExperience = before?.experiences.find(
      (exp) => String(exp._id) === experienceId,
    );

    const user = await this.usersService.updateExperience(
      id,
      experienceId,
      updateFields,
    );

    if (isOverride) {
      const updated = user.experiences.find(
        (exp) => String(exp._id) === experienceId,
      );
      await this.recordAdminOverride(
        requester,
        { id, fullName: user.fullName },
        'update_experience',
        previousExperience
          ? {
              title: previousExperience.title,
              company: previousExperience.company,
              from: previousExperience.from,
              to: previousExperience.to,
              description: previousExperience.description,
            }
          : null,
        updated
          ? {
              title: updated.title,
              company: updated.company,
              from: updated.from,
              to: updated.to,
              description: updated.description,
            }
          : null,
        reason,
      );
    }
    return this.toProfile(user);
  }

  @Delete(':id/experiences/:experienceId')
  @HttpCode(200)
  async removeExperience(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('experienceId', ParseObjectIdPipe) experienceId: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: ReasonDto,
  ) {
    this.assertOwnerOrAdmin(requester, id);
    const isOverride = this.isAdminOverride(requester, id);

    const before = isOverride ? await this.usersService.getProfileById(id) : null;
    const removed = before?.experiences.find(
      (exp) => String(exp._id) === experienceId,
    );

    const user = await this.usersService.removeExperience(id, experienceId);

    if (isOverride) {
      await this.recordAdminOverride(
        requester,
        { id, fullName: user.fullName },
        'remove_experience',
        removed
          ? {
              title: removed.title,
              company: removed.company,
              from: removed.from,
              to: removed.to,
              description: removed.description,
            }
          : null,
        null,
        dto.reason,
      );
    }
    return this.toProfile(user);
  }

  // Reused by every owner-or-admin write route above — same check, one
  // place, rather than four copies of the same if-statement.
  private assertOwnerOrAdmin(requester: RequestUser, targetUserId: string) {
    if (requester.userId !== targetUserId && requester.role !== 'admin') {
      throw new ForbiddenException('You can only edit your own profile');
    }
  }

  // Distinguishes "an admin acting on someone else" (audit-logged and
  // notified) from "you editing your own data" (neither) — assertOwnerOrAdmin
  // above only tells us the request is *allowed*, not which of those two
  // allowed cases it actually is.
  private isAdminOverride(requester: RequestUser, targetUserId: string) {
    return requester.userId !== targetUserId && requester.role === 'admin';
  }

  // Shared by every skills/experience write above once isAdminOverride is
  // true — one place for "log it, and notify the target unless they no
  // longer exist" rather than four near-identical call sites.
  private async recordAdminOverride(
    requester: RequestUser,
    target: { id: string; fullName: string },
    action: AuditAction,
    previousState: Record<string, unknown> | null,
    newState: Record<string, unknown> | null,
    reason?: string,
  ) {
    await this.auditService.log({
      adminId: requester.userId,
      adminFullName: requester.fullName,
      targetUserId: target.id,
      targetFullName: target.fullName,
      action,
      previousState,
      newState,
      reason,
    });

    const message = reason
      ? `An administrator updated your profile. Reason: ${reason}`
      : 'An administrator updated your profile.';
    await this.notificationsService.create(target.id, message);
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
