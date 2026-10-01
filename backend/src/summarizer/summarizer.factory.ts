import { Logger } from '@nestjs/common';
import { GeminiSummarizer } from './gemini-summarizer';
import { MockSummarizer } from './mock-summarizer';
import { Summarizer } from './summarizer.interface';

// Kept apart from summarizer.module.ts on purpose: the module pulls in the
// controller (and so @nestjs/throttler), which Jest cannot load in a plain unit
// test. Provider selection stays testable without any of that.

export interface SummarizerSettings {
  provider?: 'mock' | 'gemini';
  apiKey?: string;
  model: string;
  timeoutMs: number;
}

/**
 * Picks the provider from settings and logs which one is active.
 * - provider "mock" -> mock, even if a key exists
 * - no usable (non-blank) key -> mock, with a warning
 * - otherwise -> gemini
 */
export function createSummarizer(
  settings: SummarizerSettings,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('Summarizer'),
): Summarizer {
  const apiKey = settings.apiKey?.trim() ?? '';

  if (settings.provider === 'mock') {
    logger.log('Active summarizer: mock (SUMMARIZER_PROVIDER=mock)');
    return new MockSummarizer();
  }

  if (apiKey.length === 0) {
    logger.warn(
      settings.provider === 'gemini'
        ? 'SUMMARIZER_PROVIDER=gemini but SUMMARIZER_API_KEY is empty. Active summarizer: mock'
        : 'Active summarizer: mock (no SUMMARIZER_API_KEY set; summaries are extractive, not model-generated)',
    );
    return new MockSummarizer();
  }

  logger.log(`Active summarizer: gemini (model ${settings.model})`);
  return new GeminiSummarizer({
    apiKey,
    model: settings.model,
    timeoutMs: settings.timeoutMs,
  });
}
