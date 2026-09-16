import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  assertOwnerOrAdmin,
  isAdminOverride,
  recordAdminOverride,
} from '../common/authorization/owner-or-admin';
import type { RequestUser } from '../common/authorization/owner-or-admin';
import { ReasonDto } from '../common/dto/reason.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/schemas/user.schema';
import { AddExperienceDto } from './dto/add-experience.dto';
import { UpdateBioDto } from './dto/update-bio.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { UpdateHeadlineDto } from './dto/update-headline.dto';
import { UpdatePortfolioProjectsDto } from './dto/update-portfolio-projects.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSkillsDto } from './dto/update-skills.dto';
import { ProfilesService } from './profiles.service';

// Two identity models, by design: /profile/me is always JWT-derived
// (@CurrentUser(), backed by payload.sub) and never accepts a client-
// supplied id — self-service profile fields can only ever be read/written
// by their owner. /profile/:id is the explicit id-based surface: open read
// access for any authenticated user, and owner-or-admin gating (via
// assertOwnerOrAdmin) for the skills/experience write routes below, mirroring
// how those same actions worked on UsersController before this module
// absorbed them.
@Controller('profile')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // No @Public()/@Roles() — protected by the global JwtAuthGuard default,
  // open to any authenticated user (viewing/editing your own profile
  // doesn't require a role beyond "logged in").
  @Get('me')
  async getMyProfile(@CurrentUser() requester: RequestUser) {
    const user = await this.profilesService.getProfile(requester.userId);
    return this.toProfileResponse(user);
  }

  @Patch('me')
  @HttpCode(200)
  async updateMyProfile(
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.profilesService.updateProfile(
      requester.userId,
      dto,
    );
    return this.toProfileResponse(user);
  }

  // Any authenticated user may view any other user's profile — same access
  // level as the old GET /users/:id it replaces.
  @Get(':id')
  async getProfileById(@Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.profilesService.getProfile(id);
    return this.toProfileResponse(user);
  }

  // Moved from UsersController verbatim — owner-or-admin, full replace,
  // audit+notify only when an admin acts on someone else.
  @Patch(':id/skills')
  @HttpCode(200)
  async updateSkills(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateSkillsDto,
  ) {
    assertOwnerOrAdmin(requester, id);
    const isOverride = isAdminOverride(requester, id);
    const before = isOverride ? await this.profilesService.getProfile(id) : null;

    const user = await this.profilesService.updateSkills(id, dto.skills);

    if (isOverride) {
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
        requester,
        { id, fullName: user.fullName },
        'update_skills',
        { skills: before!.skills },
        { skills: user.skills },
        dto.reason,
      );
    }
    return this.toProfileResponse(user);
  }

  // Same shape as updateSkills above — full replace, single scalar field,
  // audit+notify only when an admin acts on someone else. Admin-override
  // parity with skills/experiences/fullname: headline/bio/portfolioProjects
  // previously had no admin path at all (self-only via PATCH /profile/me).
  @Patch(':id/headline')
  @HttpCode(200)
  async updateHeadline(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateHeadlineDto,
  ) {
    assertOwnerOrAdmin(requester, id);
    const isOverride = isAdminOverride(requester, id);
    const before = isOverride ? await this.profilesService.getProfile(id) : null;

    const user = await this.profilesService.updateHeadline(id, dto.headline);

    if (isOverride) {
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
        requester,
        { id, fullName: user.fullName },
        'update_headline',
        // headline has no schema default (unlike skills/portfolioProjects,
        // which Mongoose auto-defaults to []), so a first-ever edit leaves
        // before.headline as undefined — coerce to null so the audit
        // entry stores an explicit "there was no previous value" rather
        // than silently dropping the key (MongoDB omits undefined-valued
        // object keys on insert).
        { headline: before!.headline ?? null },
        { headline: user.headline },
        dto.reason,
      );
    }
    return this.toProfileResponse(user);
  }

  @Patch(':id/bio')
  @HttpCode(200)
  async updateBio(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateBioDto,
  ) {
    assertOwnerOrAdmin(requester, id);
    const isOverride = isAdminOverride(requester, id);
    const before = isOverride ? await this.profilesService.getProfile(id) : null;

    const user = await this.profilesService.updateBio(id, dto.bio);

    if (isOverride) {
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
        requester,
        { id, fullName: user.fullName },
        'update_bio',
        // Same reasoning as updateHeadline above — bio has no schema
        // default either.
        { bio: before!.bio ?? null },
        { bio: user.bio },
        dto.reason,
      );
    }
    return this.toProfileResponse(user);
  }

  @Patch(':id/portfolio-projects')
  @HttpCode(200)
  async updatePortfolioProjects(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdatePortfolioProjectsDto,
  ) {
    assertOwnerOrAdmin(requester, id);
    const isOverride = isAdminOverride(requester, id);
    const before = isOverride ? await this.profilesService.getProfile(id) : null;

    const user = await this.profilesService.updatePortfolioProjects(
      id,
      dto.portfolioProjects,
    );

    if (isOverride) {
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
        requester,
        { id, fullName: user.fullName },
        'update_portfolio_projects',
        { portfolioProjects: before!.portfolioProjects },
        { portfolioProjects: user.portfolioProjects },
        dto.reason,
      );
    }
    return this.toProfileResponse(user);
  }

  @Post(':id/experiences')
  @HttpCode(201)
  async addExperience(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: AddExperienceDto,
  ) {
    assertOwnerOrAdmin(requester, id);
    const isOverride = isAdminOverride(requester, id);
    const { reason, ...experienceData } = dto;

    const user = await this.profilesService.addExperience(id, experienceData);

    if (isOverride) {
      // $push appends — the just-added entry is always the last element.
      const added = user.experiences[user.experiences.length - 1];
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
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
    return this.toProfileResponse(user);
  }

  @Patch(':id/experiences/:experienceId')
  @HttpCode(200)
  async updateExperience(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('experienceId', ParseObjectIdPipe) experienceId: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: UpdateExperienceDto,
  ) {
    assertOwnerOrAdmin(requester, id);
    const isOverride = isAdminOverride(requester, id);
    const { reason, ...updateFields } = dto;

    const before = isOverride ? await this.profilesService.getProfile(id) : null;
    const previousExperience = before?.experiences.find(
      (exp) => String(exp._id) === experienceId,
    );

    const user = await this.profilesService.updateExperience(
      id,
      experienceId,
      updateFields,
    );

    if (isOverride) {
      const updated = user.experiences.find(
        (exp) => String(exp._id) === experienceId,
      );
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
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
    return this.toProfileResponse(user);
  }

  @Delete(':id/experiences/:experienceId')
  @HttpCode(200)
  async removeExperience(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('experienceId', ParseObjectIdPipe) experienceId: string,
    @CurrentUser() requester: RequestUser,
    @Body() dto: ReasonDto,
  ) {
    assertOwnerOrAdmin(requester, id);
    const isOverride = isAdminOverride(requester, id);

    const before = isOverride ? await this.profilesService.getProfile(id) : null;
    const removed = before?.experiences.find(
      (exp) => String(exp._id) === experienceId,
    );

    const user = await this.profilesService.removeExperience(id, experienceId);

    if (isOverride) {
      await recordAdminOverride(
        { auditService: this.auditService, notificationsService: this.notificationsService },
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
    return this.toProfileResponse(user);
  }

  // Hand-picked shape, same reasoning as UsersController.toProfile — never
  // spread the raw document, so passwordHash (and anything else added to
  // the schema later) can't leak through by accident.
  private toProfileResponse(user: User) {
    return {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      headline: user.headline,
      bio: user.bio,
      skills: user.skills,
      experiences: user.experiences,
      portfolioProjects: user.portfolioProjects,
    };
  }
}
