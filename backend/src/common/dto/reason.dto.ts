import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Shared across feature modules by DELETE endpoints (and other bodyless
// admin-override actions) that otherwise take no body — only meaningful
// when an admin acts on someone else's data, recorded on the audit log
// entry.
export class ReasonDto {
  @ApiPropertyOptional({
    description:
      'Only meaningful when an admin acts on someone else\'s data — recorded on the audit log entry and appended to the notification sent to the affected user. Ignored on a self-action.',
    example: 'violates community guidelines',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
