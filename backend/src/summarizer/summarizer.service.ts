import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Summarizer,
  SummarizerInput,
  SummarizerSource,
} from './summarizer.interface';
import { SUMMARIZER, SummarizerError } from './summarizer.interface';
import { parseSummaryOutput } from './summary.schema';

export const MIN_BODY_LENGTH = 200;
export const MAX_BODY_LENGTH = 8000;

export interface SummarizeResult {
  summary: string;
  tags: string[];
  source: SummarizerSource;
  /** True when the post body was cut to MAX_BODY_LENGTH before summarizing. */
  truncated: boolean;
}

// Cuts to MAX_BODY_LENGTH without leaving half of an emoji (a lone high surrogate) at the end.
function cutBody(text: string): string {
  return text.slice(0, MAX_BODY_LENGTH).replace(/[\uD800-\uDBFF]$/, '');
}

@Injectable()
export class SummarizerService {
  private readonly logger = new Logger(SummarizerService.name);

  constructor(@Inject(SUMMARIZER) private readonly summarizer: Summarizer) {}

  async summarize({ title, body }: SummarizerInput): Promise<SummarizeResult> {
    const trimmed = body.trim();
    if (trimmed.length < MIN_BODY_LENGTH) {
      throw new UnprocessableEntityException(
        `Post body is too short to summarize (minimum ${MIN_BODY_LENGTH} characters).`,
      );
    }

    const truncated = trimmed.length > MAX_BODY_LENGTH;
    // The provider only ever receives title and body, nothing else about the post or its author.
    const payload: SummarizerInput = {
      title,
      body: truncated ? cutBody(trimmed) : trimmed,
    };

    let raw: unknown;
    try {
      raw = await this.summarizer.summarize(payload);
    } catch (error) {
      this.rethrowAsHttp(error);
    }

    const parsed = parseSummaryOutput(raw);
    if (!parsed.ok) {
      this.logger.warn(
        `Summarizer (${this.summarizer.source}) output rejected: ${parsed.reason}`,
      );
      throw new BadGatewayException(
        'The summarizer returned an unusable response. Please try again.',
      );
    }
    if (parsed.droppedTagCount > 0) {
      this.logger.debug(
        `Dropped ${parsed.droppedTagCount} invalid tag(s) from summarizer output`,
      );
    }

    return {
      summary: parsed.summary,
      tags: parsed.tags,
      source: this.summarizer.source,
      truncated,
    };
  }

  /** Maps provider failures to the HTTP error contract. Unknown errors are rethrown unchanged (500). */
  private rethrowAsHttp(error: unknown): never {
    if (!(error instanceof SummarizerError)) {
      // The global filter turns this into a bare 500 without logging, so record it here.
      this.logger.error(
        `Summarizer (${this.summarizer.source}) threw an unexpected error`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    // Log the kind and upstream status only, never the upstream message or any post content.
    const upstream =
      error.status !== undefined ? ` (upstream HTTP ${error.status})` : '';
    this.logger.warn(
      `Summarizer (${this.summarizer.source}) failed: ${error.kind}${upstream}`,
    );

    switch (error.kind) {
      case 'timeout':
        throw new GatewayTimeoutException(
          'The summarizer took too long to respond. Please try again.',
        );
      case 'malformed':
        throw new BadGatewayException(
          'The summarizer returned an unusable response. Please try again.',
        );
      case 'unavailable':
        throw new ServiceUnavailableException(
          'The summarizer is temporarily unavailable. Please try again later.',
        );
    }
  }
}
