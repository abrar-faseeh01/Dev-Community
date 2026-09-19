import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateFullNameDto {
  // Same rule as signup's fullName field.
  @ApiProperty({ minLength: 2, example: 'Ada K. Lovelace' })
  @IsString()
  @MinLength(2)
  fullName: string;

  // Only meaningful for this admin-override route — recorded on the audit
  // log entry, never applied to the user document itself.
  @ApiPropertyOptional({
    description: 'Recorded on the audit log entry and included in the notification sent to the user.',
    example: 'name correction requested by user',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
