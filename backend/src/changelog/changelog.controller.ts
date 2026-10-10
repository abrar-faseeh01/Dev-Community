import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiSessionRequired } from '../common/swagger/session-required';
import { ChangelogService } from './changelog.service';
import { ApiListChangelog, ApiSyncChangelog } from './changelog.swagger';
import { SyncChangelogDto } from './dto/sync-changelog.dto';

@ApiTags('changelog')
@ApiSessionRequired()
@Controller('changelog')
export class ChangelogController {
  constructor(private readonly changelogService: ChangelogService) {}

  // Any signed-in user (no @Public(), so the global JwtAuthGuard applies).
  @Get()
  @ApiListChangelog()
  findAll() {
    return this.changelogService.findAll();
  }

  // 200, not 201: it upserts. 5 a minute per IP, since each call spends
  // GitHub API quota.
  @Post('sync')
  @HttpCode(200)
  @Roles('admin')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiSyncChangelog()
  sync(@Body() dto: SyncChangelogDto) {
    return this.changelogService.sync(dto.repo);
  }
}
