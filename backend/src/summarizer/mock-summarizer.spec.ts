import { FALLBACK_TAG, MockSummarizer } from './mock-summarizer';
import {
  MAX_TAGS,
  SUMMARY_MAX_LENGTH,
  parseSummaryOutput,
} from './summary.schema';

describe('MockSummarizer', () => {
  const mock = new MockSummarizer();

  it('identifies itself as the mock source', () => {
    expect(mock.source).toBe('mock');
  });

  it('is deterministic: the same input gives identical output', async () => {
    const input = {
      title: 'Docker tips',
      body: 'I use Docker with NestJS. It works well. Really.',
    };
    expect(await mock.summarize(input)).toEqual(await mock.summarize(input));
  });

  it('uses the first two sentences as the summary and tags in keyword-list order', async () => {
    const result = await mock.summarize({
      title: 'Stack notes',
      body: 'React and NestJS make a solid pairing. We tested it with Docker. It went well.',
    });
    expect(result).toEqual({
      summary:
        'React and NestJS make a solid pairing. We tested it with Docker.',
      tags: ['React', 'NestJS', 'Docker'],
    });
  });

  it('does not split sentences inside names like Next.js', async () => {
    const result = (await mock.summarize({
      title: 't',
      body: 'Next.js handles routing for us. Second sentence here. Third one.',
    })) as { summary: string; tags: string[] };
    expect(result.summary).toBe(
      'Next.js handles routing for us. Second sentence here.',
    );
    expect(result.tags).toContain('Next.js');
  });

  it('matches keywords case-insensitively in the title as well as the body', async () => {
    const result = (await mock.summarize({
      title: 'MONGODB indexes',
      body: 'Plain text here.',
    })) as {
      tags: string[];
    };
    expect(result.tags).toEqual(['MongoDB']);
  });

  it('falls back to the general tag when no keyword matches, and the result is still valid', async () => {
    const result = await mock.summarize({
      title: 'A walk in the park',
      body: 'Nothing technical in this post at all. It is just text.',
    });
    expect(result).toMatchObject({ tags: [FALLBACK_TAG] });
    expect(parseSummaryOutput(result).ok).toBe(true);
  });

  it('tags REST API only for RESTful / REST API, not the everyday word "rest"', async () => {
    const tagsOf = async (body: string) =>
      ((await mock.summarize({ title: 't', body })) as { tags: string[] }).tags;

    expect(await tagsOf('I will take the rest of the day off.')).toEqual([
      FALLBACK_TAG,
    ]);
    expect(await tagsOf('Designing a RESTful service.')).toEqual(['REST API']);
    expect(await tagsOf('Our REST API is versioned.')).toEqual(['REST API']);
  });

  it('never returns more than the maximum number of tags', async () => {
    const result = (await mock.summarize({
      title: 'Everything',
      body: 'React Next.js TypeScript JavaScript Node.js NestJS MongoDB Docker Jest all in one post.',
    })) as { tags: string[] };
    expect(result.tags).toHaveLength(MAX_TAGS);
    expect(result.tags).toEqual([
      'React',
      'Next.js',
      'TypeScript',
      'JavaScript',
      'Node.js',
    ]);
  });

  it('keeps the summary within the maximum length when there is no sentence break', async () => {
    const result = (await mock.summarize({
      title: 't',
      body: 'word '.repeat(500),
    })) as {
      summary: string;
    };
    expect(result.summary.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
    expect(parseSummaryOutput(result).ok).toBe(true);
  });

  it('falls back to the title when the body is blank', async () => {
    const result = await mock.summarize({ title: 'Hello world', body: '   ' });
    expect(result).toMatchObject({ summary: 'Hello world' });
  });
});
