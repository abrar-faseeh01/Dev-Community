import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PortfolioProjectDto } from './portfolio-project.dto';

export class UpdatePortfolioProjectsDto {
  // Full replace, same convention as UpdateSkillsDto and
  // UpdateProfileDto.portfolioProjects: the whole array is sent and stored
  // as-is. Each entry still gets full nested validation via
  // ValidateNested()/Type().
  @ApiProperty({
    type: [PortfolioProjectDto],
    maxItems: 20,
    description: 'Full replacement of the portfolio projects list.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PortfolioProjectDto)
  portfolioProjects: PortfolioProjectDto[];

  // Only meaningful when an admin edits someone else's profile — recorded
  // on the audit log entry, never applied to the user document itself.
  @ApiPropertyOptional({
    description: 'Recorded on the audit log entry when an admin edits someone else\'s profile.',
    example: 'removed a project that violated content policy',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
