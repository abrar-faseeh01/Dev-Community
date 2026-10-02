import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { AuditLogListResponseDto } from './dto/audit-log-response.dto';

export function ApiListAuditLogs() {
  return applyDecorators(
    ApiForbiddenResponse({
      description: 'Caller is not an admin.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({ type: AuditLogListResponseDto }),
    ApiOperation({
      summary: 'List every admin-override audit entry (admin only)',
      description:
        'Newest first. No filtering or pagination yet — every admin override across users, profiles, and posts is returned.',
    }),
  );
}
