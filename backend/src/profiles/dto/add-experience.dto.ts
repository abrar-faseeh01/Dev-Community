import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AddExperienceDto {
  @ApiProperty({ example: 'Software Engineer' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  company: string;

  // Free-text, e.g. "2019" or "Jan 2021" — see schemas/user.schema.ts.
  @ApiProperty({ description: 'Free text, not a parsed date — e.g. "2019" or "Jan 2021".', example: '2021' })
  @IsString()
  from: string;

  @ApiPropertyOptional({ description: 'Omit for an ongoing role.', example: '2023' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 'Worked on the payments team.' })
  @IsOptional()
  @IsString()
  description?: string;

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry, never persisted onto the experience itself
  // (the controller strips it before calling ProfilesService).
  @ApiPropertyOptional({
    description: 'Recorded on the audit log entry when an admin edits someone else\'s profile.',
    example: 'added missing role at user\'s request',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
