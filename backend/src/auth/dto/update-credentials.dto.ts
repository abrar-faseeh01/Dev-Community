import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCredentialsDto {
  @IsString()
  currentPassword: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  newFullName?: string;

  @IsOptional()
  @IsEmail()
  newEmail?: string;

  @IsOptional()
  @MinLength(8)
  newPassword?: string;
}
