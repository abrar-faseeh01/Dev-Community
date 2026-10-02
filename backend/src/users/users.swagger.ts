import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { NullDataResponseDto } from '../common/dto/null-data-response.dto';
import { UsersListResponseDto } from './dto/users-response.dto';

export function ApiListUsers() {
  return applyDecorators(
    ApiForbiddenResponse({
      description: 'Caller is not an admin.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: UsersListResponseDto }),
    ApiOperation({ summary: 'List all users (admin only)' }),
  );
}

export function ApiDeleteUser() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'User not found.',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: 'Caller is not an admin, or the target is an admin account.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: NullDataResponseDto }),
    ApiParam({ name: 'id', example: '64f1c2e5a1b2c3d4e5f6a7b8' }),
    ApiOperation({
      summary: 'Permanently delete a user (admin only)',
      description:
        'Hard delete — not soft delete. Admin accounts cannot be deleted through this route, including by themselves.',
    }),
  );
}
