import { ApiProperty } from '@nestjs/swagger';

export class UserListItemDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName: string;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @ApiProperty({ enum: ['admin', 'user'], example: 'user' })
  role: string;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  createdAt: Date;
}

export class UsersListResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: [UserListItemDto] })
  data: UserListItemDto[];
}
