import { ApiProperty } from '@nestjs/swagger';

export class ExperienceResponseDto {
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

export class PortfolioProjectResponseDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7ba' })
  _id: string;

  @ApiProperty({ example: 'Realtime Chat App' })
  title: string;

  @ApiProperty({ required: false, example: 'A WebSocket-based chat app with rooms and presence.' })
  description?: string;

  @ApiProperty({ example: 'https://chat-demo.example.com' })
  liveUrl: string;

  @ApiProperty({ example: 'https://github.com/example/chat-app' })
  githubUrl: string;

  @ApiProperty({ type: [String], example: ['typescript', 'socket.io', 'redis'] })
  technologies: string[];

  @ApiProperty({ example: '2025-01-15T00:00:00.000Z' })
  startDate: Date;

  @ApiProperty({ required: false, example: '2025-06-30T00:00:00.000Z' })
  endDate?: Date;

  @ApiProperty({ example: false })
  isCurrent: boolean;
}

// The shape returned by every /profile/* route — GET, PATCH me, and every
// owner-or-admin write below it. Never spread the raw document, so
// passwordHash (select:false + toJSON already, but belt-and-suspenders)
// and anything added to the schema later can't leak through by accident.
export class ProfileDto {
  @ApiProperty({ example: '64f1c2e5a1b2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName: string;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @ApiProperty({ enum: ['admin', 'user'], example: 'user' })
  role: string;

  @ApiProperty({ required: false, example: 'Senior Backend Engineer @ Acme' })
  headline?: string;

  @ApiProperty({ required: false, example: 'I build backend systems and enjoy mentoring junior engineers.' })
  bio?: string;

  @ApiProperty({ type: [String], example: ['typescript', 'nestjs', 'mongodb'] })
  skills: string[];

  @ApiProperty({ type: [ExperienceResponseDto] })
  experiences: ExperienceResponseDto[];

  @ApiProperty({ type: [PortfolioProjectResponseDto] })
  portfolioProjects: PortfolioProjectResponseDto[];
}

export class ProfileResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: ProfileDto })
  data: ProfileDto;
}
