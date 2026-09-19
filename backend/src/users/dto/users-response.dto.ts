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

// Returned by PATCH /users/:id/fullname — a narrower slice than
// ProfilesController's full profile shape (no headline/bio/portfolioProjects),
// see UsersController.toProfile.
class ExperienceSummaryDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b9' })
  _id: string;

  @ApiProperty({ example: 'Software Engineer' })
  title: string;

  @ApiProperty({ example: 'Acme Corp' })
  company: string;

  @ApiProperty({ example: '2021' })
  from: string;

  @ApiProperty({ required: false, example: '2023' })
  to?: string;

  @ApiProperty({ required: false, example: 'Worked on the payments team.' })
  description?: string;
}

export class UserProfileSummaryDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName: string;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @ApiProperty({ enum: ['admin', 'user'], example: 'user' })
  role: string;

  @ApiProperty({ type: [String], example: ['typescript', 'nestjs'] })
  skills: string[];

  @ApiProperty({ type: [ExperienceSummaryDto] })
  experiences: ExperienceSummaryDto[];
}

export class UpdateFullNameResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: UserProfileSummaryDto })
  data: UserProfileSummaryDto;
}
