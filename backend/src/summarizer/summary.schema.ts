import { z } from 'zod';

export const SUMMARY_MAX_LENGTH = 600;
export const TAG_MAX_LENGTH = 30;
export const MAX_TAGS = 5;

// Must start with a letter or digit; then letters, digits, space and . + # / -
const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .+#/-]*$/u;

export type SummaryParseFailure =
  'invalid_shape' | 'invalid_summary' | 'no_valid_tags';

export type SummaryParseResult =
  | { ok: true; summary: string; tags: string[]; droppedTagCount: number }
  | { ok: false; reason: SummaryParseFailure };

const outputShape = z.object({
  summary: z.string().trim().min(1).max(SUMMARY_MAX_LENGTH),
  tags: z.array(z.unknown()),
});

function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const tag = raw.trim();
  if (tag.length < 1 || tag.length > TAG_MAX_LENGTH) return null;
  return TAG_PATTERN.test(tag) ? tag : null;
}

export function parseSummaryOutput(raw: unknown): SummaryParseResult {
  const parsed = outputShape.safeParse(raw);
  if (!parsed.success) {
    const summaryProblem = parsed.error.issues.some(
      (issue) => issue.path[0] === 'summary',
    );
    return {
      ok: false,
      reason: summaryProblem ? 'invalid_summary' : 'invalid_shape',
    };
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  let droppedTagCount = 0;

  for (const candidate of parsed.data.tags) {
    const tag = normalizeTag(candidate);
    if (tag === null) {
      droppedTagCount += 1;
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  if (tags.length === 0) return { ok: false, reason: 'no_valid_tags' };

  return {
    ok: true,
    summary: parsed.data.summary,
    tags: tags.slice(0, MAX_TAGS),
    droppedTagCount,
  };
}
