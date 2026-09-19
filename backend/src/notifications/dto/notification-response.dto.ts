import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7e0' })
  _id: string;

  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b8' })
  userId: string;

  @ApiProperty({ example: 'An administrator updated your post.' })
  message: string;

  @ApiProperty({ example: false })
  read: boolean;

  @ApiProperty({ example: '2026-09-18T09:40:43.891Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-18T09:40:43.891Z' })
  updatedAt: Date;
}

export class NotificationListResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: [NotificationDto] })
  data: NotificationDto[];
}

export class NotificationResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: NotificationDto })
  data: NotificationDto;
}

export class UnreadCountResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ example: 3 })
  data: number;
}
