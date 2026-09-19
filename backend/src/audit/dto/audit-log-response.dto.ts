import { ApiProperty } from '@nestjs/swagger';

// Returned as raw Mongoose documents by AuditService.findAll() — no
// toJSON transform is defined on AuditLog, so _id and __v come through
// as-is (unlike User, which strips passwordHash/__v).
export class AuditLogDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7d0' })
  _id: string;

  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b8', description: 'The admin who performed the override.' })
  adminId: string;

  @ApiProperty({ example: 'Site Admin' })
  adminFullName: string;

  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b9', description: 'The user whose data was changed.' })
  targetUserId: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  targetFullName: string;

  @ApiProperty({
    enum: [
      'update_skills',
      'add_experience',
      'update_experience',
      'remove_experience',
      'update_fullname',
      'update_headline',
      'update_bio',
      'update_portfolio_projects',
      'delete_user',
      'update_post',
      'delete_post',
    ],
    example: 'update_post',
  })
  action: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { postId: '64f1c2e5a1b2c3d4e5f6a7c0', title: 'Old title' },
    description: 'Only the changed shape, not the whole document.',
  })
  previousState: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { postId: '64f1c2e5a1b2c3d4e5f6a7c0', title: 'New title' },
    description: 'null for delete actions.',
  })
  newState: Record<string, unknown> | null;

  @ApiProperty({ required: false, example: 'violates community guidelines' })
  reason?: string;

  @ApiProperty({ example: '2026-09-18T09:40:43.628Z' })
  createdAt: Date;
}

export class AuditLogListResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: [AuditLogDto] })
  data: AuditLogDto[];
}
