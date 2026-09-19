import { Controller, Get } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { AuditService } from './audit.service';
import { AuditLogListResponseDto } from './dto/audit-log-response.dto';

@ApiTags('admin')
@ApiCookieAuth('access_token')
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired session cookie.', type: ErrorResponseDto })
@Controller('admin')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-log')
  @Roles('admin')
  @ApiOperation({
    summary: 'List every admin-override audit entry (admin only)',
    description: 'Newest first. No filtering or pagination yet — every admin override across users, profiles, and posts is returned.',
  })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  @ApiForbiddenResponse({ description: 'Caller is not an admin.', type: ErrorResponseDto })
  findAll() {
    return this.auditService.findAll();
  }
}
