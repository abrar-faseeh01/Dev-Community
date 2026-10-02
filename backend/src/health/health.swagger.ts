import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { HealthResponseDto } from './dto/health-response.dto';

export function ApiHealthCheck() {
  return applyDecorators(
    ApiServiceUnavailableResponse({
      description: 'The API is up but the database is not connected.',
      type: ErrorResponseDto,
    }),
    ApiOkResponse({
      description: 'API and database are both reachable.',
      type: HealthResponseDto,
    }),
  );
}
