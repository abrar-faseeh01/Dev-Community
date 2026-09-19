import { ApiProperty } from '@nestjs/swagger';

// Shared by endpoints with nothing meaningful to hand back (logout,
// deleteUser) — see backend/src/common/interceptors/response.interceptor.ts,
// which wraps a `null`/`void` controller return in exactly this shape.
export class NullDataResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true, example: null })
  data: null;
}
