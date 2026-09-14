import { IsEmail, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  // Deliberately no `role` field — accepting one from the client
  // is the #1 privilege-escalation bug. Role is always server-assigned.
}
