import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOkResponse({
    description: 'API and database are both reachable.',
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The API is up but the database is not connected.',
    type: ErrorResponseDto,
  })
  check() {
    return this.healthService.check();
  }
}
