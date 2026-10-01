export const SUMMARIZER = Symbol('SUMMARIZER');

export interface SummarizerInput {
  title: string;
  body: string;
}

export type SummarizerSource = 'mock' | 'gemini';

export type SummarizerFailureKind = 'timeout' | 'unavailable' | 'malformed';

/**
 * The only error a provider may throw. SummarizerService maps `kind` to the
 * HTTP error contract (timeout -> 504, malformed -> 502, unavailable -> 503).
 * `status` is the upstream HTTP status when there was one (for logs only).
 */
export class SummarizerError extends Error {
  constructor(
    readonly kind: SummarizerFailureKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SummarizerError';
  }
}

export interface Summarizer {
  readonly source: SummarizerSource;
  /** Returns UNVALIDATED output. The service runs parseSummaryOutput on it. */
  summarize(input: SummarizerInput): Promise<unknown>;
}
