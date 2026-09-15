import { ApiProperty } from '@nestjs/swagger';

export class HealthDataDto {
  @ApiProperty({ example: 'ok' })
  api: string;

  @ApiProperty({ example: 'connected' })
  database: string;
}

// Documents the shape ResponseInterceptor produces on success — see
// backend/src/common/interceptors/response.interceptor.ts.
export class HealthResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: HealthDataDto })
  data: HealthDataDto;
}
