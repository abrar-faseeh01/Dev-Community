import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { ApiSessionRequired } from '../common/swagger/session-required';
import { ApiListAuditLogs } from './audit.swagger';

@ApiTags('admin')
@ApiSessionRequired()
@Controller('admin')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-log')
  @Roles('admin')
  @ApiListAuditLogs()
  findAll() {
    return this.auditService.findAll();
  }
}
