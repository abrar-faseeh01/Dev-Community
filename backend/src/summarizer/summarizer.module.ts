import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from '../posts/schemas/post.schema';
import { SummarizerController } from './summarizer.controller';
import { createSummarizer } from './summarizer.factory';
import { SUMMARIZER, Summarizer } from './summarizer.interface';
import { SummarizerService } from './summarizer.service';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_TIMEOUT_MS = 10000;

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
  ],
  controllers: [SummarizerController],
  providers: [
    {
      provide: SUMMARIZER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Summarizer =>
        createSummarizer({
          provider: config.get<'mock' | 'gemini'>('SUMMARIZER_PROVIDER'),
          apiKey: config.get<string>('SUMMARIZER_API_KEY'),
          model: config.get<string>('SUMMARIZER_MODEL') ?? DEFAULT_MODEL,
          timeoutMs: Number(
            config.get('SUMMARIZER_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS,
          ),
        }),
    },
    SummarizerService,
  ],
  exports: [SummarizerService],
})
export class SummarizerModule {}
