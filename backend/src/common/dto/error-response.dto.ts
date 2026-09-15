import { ApiProperty } from '@nestjs/swagger';

// Documents the shape HttpExceptionFilter produces for every error response
// across the API — kept in sync with backend/src/common/filters/http-exception.filter.ts.
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ example: 503 })
  statusCode: number;

  @ApiProperty({ example: 'Database not connected' })
  message: string;

  @ApiProperty({
    type: [String],
    example: [],
    description: 'Field-level validation messages, when applicable.',
  })
  errors: string[];
}
