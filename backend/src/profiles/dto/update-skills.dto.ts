import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateSkillsDto {
  // Full replace: the whole array is sent and stored as-is. An empty array
  // is a valid update (clearing all skills).
  @ApiProperty({
    type: [String],
    description: 'Full replacement of the skills list — an empty array clears it.',
    example: ['typescript', 'nestjs', 'mongodb'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  skills: string[];

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry, never applied to the user document itself.
  @ApiPropertyOptional({
    description: 'Recorded on the audit log entry when an admin edits someone else\'s profile.',
    example: 'added missing skills at user\'s request',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
