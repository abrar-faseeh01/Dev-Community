import { ApiProperty } from '@nestjs/swagger';

// The shape returned by signup/login/me/PATCH me — never includes
// passwordHash (select:false at the schema level, stripped again in
// toJSON as a second line of defense).
export class AuthUserDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName: string;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @ApiProperty({ enum: ['admin', 'user'], example: 'user' })
  role: string;
}

export class AuthResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: AuthUserDto })
  data: AuthUserDto;
}
