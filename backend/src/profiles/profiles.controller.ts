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
import {
  ApiCookieAuth,
  ApiCreatedResponse,
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
import {
  assertOwnerOrAdmin,
  isAdminOverride,
  recordAdminOverride,
} from '../common/authorization/owner-or-admin';
import type { RequestUser } from '../common/authorization/owner-or-admin';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ReasonDto } from '../common/dto/reason.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/schemas/user.schema';
import { AddExperienceDto } from './dto/add-experience.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateBioDto } from './dto/update-bio.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { UpdateHeadlineDto } from './dto/update-headline.dto';
import { UpdatePortfolioProjectsDto } from './dto/update-portfolio-projects.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSkillsDto } from './dto/update-skills.dto';
import { ProfilesService } from './profiles.service';

const ID_PARAM = { name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7b8' };
const NOT_FOUND = { description: 'User not found.', type: ErrorResponseDto };
const FORBIDDEN = {
  description: 'Caller is neither the profile owner nor an admin.',
  type: ErrorResponseDto,
};

// Two identity models, by design: /profile/me is always JWT-derived
// (@CurrentUser(), backed by payload.sub) and never accepts a client-
// supplied id — self-service profile fields can only ever be read/written
// by their owner. /profile/:id is the explicit id-based surface: open read
// access for any authenticated user, and owner-or-admin gating (via
// assertOwnerOrAdmin) for the skills/experience write routes below, mirroring
// how those same actions worked on UsersController before this module
// absorbed them.
@ApiTags('profiles')
@ApiCookieAuth('access_token')
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired session cookie.', type: ErrorResponseDto })
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
  @ApiOperation({ summary: 'Get your own profile' })
  @ApiOkResponse({ type: ProfileResponseDto })
  async getMyProfile(@CurrentUser() requester: RequestUser) {
    const user = await this.profilesService.getProfile(requester.userId);
    return this.toProfileResponse(user);
  }

  @Patch('me')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update your own profile',
    description: 'Partial update — only the fields present in the body are changed. Each provided array field (skills, portfolioProjects) is fully replaced, not merged.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
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
  @ApiOperation({ summary: "Get another user's profile", description: 'Any authenticated user may view any other user\'s profile.' })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async getProfileById(@Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.profilesService.getProfile(id);
    return this.toProfileResponse(user);
  }

  // Moved from UsersController verbatim — owner-or-admin, full replace,
  // audit+notify only when an admin acts on someone else.
  @Patch(':id/skills')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Replace a user\'s skills',
    description: 'Owner-or-admin. When an admin edits someone else\'s skills, the change is audit-logged and the user is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
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
        'An administrator updated your profile.',
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
  @ApiOperation({
    summary: 'Replace a user\'s headline',
    description: 'Owner-or-admin. When an admin edits someone else\'s headline, the change is audit-logged and the user is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
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
        'An administrator updated your profile.',
        dto.reason,
      );
    }
    return this.toProfileResponse(user);
  }

  @Patch(':id/bio')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Replace a user\'s bio',
    description: 'Owner-or-admin. When an admin edits someone else\'s bio, the change is audit-logged and the user is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
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
        'An administrator updated your profile.',
        dto.reason,
      );
    }
    return this.toProfileResponse(user);
  }

  @Patch(':id/portfolio-projects')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Replace a user\'s portfolio projects',
    description: 'Owner-or-admin. Full replace of the array. When an admin edits someone else\'s projects, the change is audit-logged and the user is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
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
        'An administrator updated your profile.',
        dto.reason,
      );
    }
    return this.toProfileResponse(user);
  }

  @Post(':id/experiences')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Add a work experience entry',
    description: 'Owner-or-admin. Appends to the experiences array. When an admin adds an entry for someone else, it is audit-logged and the user is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiCreatedResponse({ type: ProfileResponseDto })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
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
        'An administrator updated your profile.',
        reason,
      );
    }
    return this.toProfileResponse(user);
  }

  @Patch(':id/experiences/:experienceId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update a work experience entry',
    description: 'Owner-or-admin. Partial update — only the fields present are changed. When an admin edits an entry for someone else, it is audit-logged and the user is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam({ name: 'experienceId', example: '64f1c2e5a1b2c3d4e5f6a7b9' })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse({ description: 'User or experience not found.', type: ErrorResponseDto })
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
        'An administrator updated your profile.',
        reason,
      );
    }
    return this.toProfileResponse(user);
  }

  @Delete(':id/experiences/:experienceId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a work experience entry',
    description: 'Owner-or-admin. When an admin removes an entry for someone else, it is audit-logged and the user is notified.',
  })
  @ApiParam(ID_PARAM)
  @ApiParam({ name: 'experienceId', example: '64f1c2e5a1b2c3d4e5f6a7b9' })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse({ description: 'User or experience not found.', type: ErrorResponseDto })
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
        'An administrator updated your profile.',
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
