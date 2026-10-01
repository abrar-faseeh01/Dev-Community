import { Summarizer, SummarizerInput } from './summarizer.interface';
import { MAX_TAGS, SUMMARY_MAX_LENGTH } from './summary.schema';

export const FALLBACK_TAG = 'general';

// Order matters: tags are returned in this order, so output is deterministic.
const KEYWORDS: ReadonlyArray<readonly [tag: string, pattern: RegExp]> = [
  ['React', /\breact\b/i],
  ['Next.js', /\bnext\.?js\b/i],
  ['TypeScript', /\btypescript\b/i],
  ['JavaScript', /\bjavascript\b/i],
  ['Node.js', /\bnode\.?js\b/i],
  ['NestJS', /\bnest\.?js\b/i],
  ['MongoDB', /\bmongo(?:db)?\b/i],
  ['Mongoose', /\bmongoose\b/i],
  ['PostgreSQL', /\bpostgres(?:ql)?\b/i],
  ['Redis', /\bredis\b/i],
  ['GraphQL', /\bgraphql\b/i],
  // "rest" alone is an everyday word, so require "RESTful" or "REST API(s)".
  ['REST API', /\brestful\b|\brest apis?\b/i],
  ['TanStack Query', /\btanstack\b|\breact[- ]query\b/i],
  ['Tailwind', /\btailwind\b/i],
  ['Jest', /\bjest\b/i],
  ['Docker', /\bdocker\b/i],
  ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
  ['CI/CD', /\bci\/cd\b/i],
  ['Git', /\bgit\b/i],
  ['AWS', /\baws\b/i],
  ['Authentication', /\bauth(?:entication)?\b|\bjwt\b/i],
  ['Testing', /\btesting\b|\b(?:unit|integration|e2e) tests?\b/i],
];

function truncate(text: string): string {
  return text.length <= SUMMARY_MAX_LENGTH
    ? text
    : `${text.slice(0, SUMMARY_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * Deterministic extractive fallback: first two sentences as the summary,
 * keyword matches as tags. Not real summarization.
 */
export class MockSummarizer implements Summarizer {
  readonly source = 'mock' as const;

  summarize({ title, body }: SummarizerInput): Promise<unknown> {
    const text = body.replace(/\s+/g, ' ').trim();
    // Split only at whitespace that follows ., ! or ? (so "Next.js" stays whole).
    const sentences = text.length > 0 ? text.split(/(?<=[.!?])\s+/) : [];
    const summary = truncate(
      sentences.slice(0, 2).join(' ') || title.trim() || 'Untitled post',
    );

    const haystack = `${title} ${body}`;
    const tags = KEYWORDS.filter(([, pattern]) => pattern.test(haystack))
      .map(([tag]) => tag)
      .slice(0, MAX_TAGS);

    return Promise.resolve({
      summary,
      tags: tags.length > 0 ? tags : [FALLBACK_TAG],
    });
  }
}
