import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PortfolioProjectDto } from './portfolio-project.dto';

// PATCH is partial at the top level (every field optional — only provided
// fields are applied), but each field that IS provided must still pass its
// own full validation. In particular, ValidateNested + Type() means a
// half-valid entry inside portfolioProjects fails the whole request rather
// than being silently accepted, even though portfolioProjects itself is
// optional here.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  skills?: string[];

  // Full replace, same convention as the existing UpdateSkillsDto/
  // updateSkills route: the whole array is sent and stored as-is.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PortfolioProjectDto)
  portfolioProjects?: PortfolioProjectDto[];
}
