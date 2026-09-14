import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateFullNameDto {
  // Same rule as signup's fullName field.
  @IsString()
  @MinLength(2)
  fullName: string;

  // Only meaningful for this admin-override route — recorded on the audit
  // log entry, never applied to the user document itself.
  @IsOptional()
  @IsString()
  reason?: string;
}
