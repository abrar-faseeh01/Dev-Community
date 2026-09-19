import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCredentialsDto {
  @ApiProperty({
    description: 'Required to change any credential, even just the name.',
    example: 'correct-horse-battery-staple',
  })
  @IsString()
  currentPassword: string;

  @ApiPropertyOptional({ minLength: 2, example: 'Ada K. Lovelace' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  newFullName?: string;

  @ApiPropertyOptional({ example: 'ada.new@example.com' })
  @IsOptional()
  @IsEmail()
  newEmail?: string;

  @ApiPropertyOptional({ minLength: 8, example: 'new-correct-horse-battery' })
  @IsOptional()
  @MinLength(8)
  newPassword?: string;
}
