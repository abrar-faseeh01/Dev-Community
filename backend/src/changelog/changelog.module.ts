import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ChangelogController } from './changelog.controller';
import { createChangelogProvider } from './changelog.factory';
import { CHANGELOG_PROVIDER, ChangelogProvider } from './changelog.provider';
import { ChangelogService } from './changelog.service';
import {
  ChangelogEntry,
  ChangelogEntrySchema,
} from './schemas/changelog-entry.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ChangelogEntry.name, schema: ChangelogEntrySchema },
    ]),
  ],
  controllers: [ChangelogController],
  providers: [
    {
      provide: CHANGELOG_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ChangelogProvider =>
        createChangelogProvider({
          provider: config.get<'mock' | 'github'>('CHANGELOG_PROVIDER'),
          appId: config.get<string>('GITHUB_APP_ID'),
          installationId: config.get<string>('GITHUB_APP_INSTALLATION_ID'),
          privateKey: config.get<string>('GITHUB_APP_PRIVATE_KEY'),
        }),
    },
    ChangelogService,
  ],
})
export class ChangelogModule {}
