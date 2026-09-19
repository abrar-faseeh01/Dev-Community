import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ minLength: 2, example: 'Ada Lovelace' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'correct-horse-battery-staple' })
  @MinLength(8)
  password: string;

  // Deliberately no `role` field — accepting one from the client
  // is the #1 privilege-escalation bug. Role is always server-assigned.
}
