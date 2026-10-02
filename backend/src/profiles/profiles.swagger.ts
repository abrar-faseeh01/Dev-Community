import { applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';

const ID_PARAM = { name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7b8' };

const NOT_FOUND = { description: 'User not found.', type: ErrorResponseDto };

const FORBIDDEN = {
  description: 'Caller is neither the profile owner nor an admin.',
  type: ErrorResponseDto,
};

export function ApiGetMyProfile() {
  return applyDecorators(
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiOperation({ summary: 'Get your own profile' }),
  );
}

export function ApiUpdateMyProfile() {
  return applyDecorators(
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiOperation({
      summary: 'Update your own profile',
      description:
        'Partial update — only the fields present in the body are changed. Each provided array field (skills, portfolioProjects) is fully replaced, not merged.',
    }),
  );
}

export function ApiGetProfileById() {
  return applyDecorators(
    ApiNotFoundResponse(NOT_FOUND),
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: "Get another user's profile",
      description: "Any authenticated user may view any other user's profile.",
    }),
  );
}

export function ApiReplaceSkills() {
  return applyDecorators(
    ApiNotFoundResponse(NOT_FOUND),
    ApiForbiddenResponse(FORBIDDEN),
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: "Replace a user's skills",
      description:
        "Owner-or-admin. When an admin edits someone else's skills, the change is audit-logged and the user is notified.",
    }),
  );
}

export function ApiReplaceHeadline() {
  return applyDecorators(
    ApiNotFoundResponse(NOT_FOUND),
    ApiForbiddenResponse(FORBIDDEN),
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: "Replace a user's headline",
      description:
        "Owner-or-admin. When an admin edits someone else's headline, the change is audit-logged and the user is notified.",
    }),
  );
}

export function ApiReplaceBio() {
  return applyDecorators(
    ApiNotFoundResponse(NOT_FOUND),
    ApiForbiddenResponse(FORBIDDEN),
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: "Replace a user's bio",
      description:
        "Owner-or-admin. When an admin edits someone else's bio, the change is audit-logged and the user is notified.",
    }),
  );
}

export function ApiReplacePortfolioProjects() {
  return applyDecorators(
    ApiNotFoundResponse(NOT_FOUND),
    ApiForbiddenResponse(FORBIDDEN),
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: "Replace a user's portfolio projects",
      description:
        "Owner-or-admin. Full replace of the array. When an admin edits someone else's projects, the change is audit-logged and the user is notified.",
    }),
  );
}

export function ApiAddExperience() {
  return applyDecorators(
    ApiNotFoundResponse(NOT_FOUND),
    ApiForbiddenResponse(FORBIDDEN),
    ApiCreatedResponse({ type: ProfileResponseDto }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: 'Add a work experience entry',
      description:
        'Owner-or-admin. Appends to the experiences array. When an admin adds an entry for someone else, it is audit-logged and the user is notified.',
    }),
  );
}

export function ApiUpdateExperience() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'User or experience not found.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse(FORBIDDEN),
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiParam({ name: 'experienceId', example: '64f1c2e5a1b2c3d4e5f6a7b9' }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: 'Update a work experience entry',
      description:
        'Owner-or-admin. Partial update — only the fields present are changed. When an admin edits an entry for someone else, it is audit-logged and the user is notified.',
    }),
  );
}

export function ApiRemoveExperience() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'User or experience not found.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse(FORBIDDEN),
    ApiOkResponse({ type: ProfileResponseDto }),
    ApiParam({ name: 'experienceId', example: '64f1c2e5a1b2c3d4e5f6a7b9' }),
    ApiParam(ID_PARAM),
    ApiOperation({
      summary: 'Remove a work experience entry',
      description:
        'Owner-or-admin. When an admin removes an entry for someone else, it is audit-logged and the user is notified.',
    }),
  );
}
