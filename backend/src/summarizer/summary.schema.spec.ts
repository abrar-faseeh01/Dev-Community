import {
  MAX_TAGS,
  SUMMARY_MAX_LENGTH,
  TAG_MAX_LENGTH,
  parseSummaryOutput,
} from './summary.schema';

describe('parseSummaryOutput', () => {
  describe('valid output', () => {
    it('accepts a normal summary and tags', () => {
      expect(
        parseSummaryOutput({
          summary: 'A short summary.',
          tags: ['react', 'nestjs'],
        }),
      ).toEqual({
        ok: true,
        summary: 'A short summary.',
        tags: ['react', 'nestjs'],
        droppedTagCount: 0,
      });
    });

    it('trims the summary and tags and ignores extra fields', () => {
      const result = parseSummaryOutput({
        summary: '  Hi there  ',
        tags: ['  react  '],
        extra: 'x',
      });
      expect(result).toEqual({
        ok: true,
        summary: 'Hi there',
        tags: ['react'],
        droppedTagCount: 0,
      });
    });

    it('accepts a summary of exactly the max length', () => {
      const result = parseSummaryOutput({
        summary: 'a'.repeat(SUMMARY_MAX_LENGTH),
        tags: ['x'],
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('malformed output', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'text'],
      ['a number', 42],
      ['an array', []],
    ])('rejects %s as invalid_shape', (_label, raw) => {
      expect(parseSummaryOutput(raw)).toEqual({
        ok: false,
        reason: 'invalid_shape',
      });
    });

    it.each([
      ['tags missing', { summary: 'ok' }],
      ['tags not an array', { summary: 'ok', tags: 'react' }],
    ])('rejects when %s as invalid_shape', (_label, raw) => {
      expect(parseSummaryOutput(raw)).toEqual({
        ok: false,
        reason: 'invalid_shape',
      });
    });

    it.each([
      ['summary missing', { tags: ['x'] }],
      ['summary not a string', { summary: 123, tags: ['x'] }],
      ['summary empty', { summary: '', tags: ['x'] }],
      ['summary whitespace only', { summary: '   ', tags: ['x'] }],
      [
        'summary too long',
        { summary: 'a'.repeat(SUMMARY_MAX_LENGTH + 1), tags: ['x'] },
      ],
    ])('rejects when %s as invalid_summary', (_label, raw) => {
      expect(parseSummaryOutput(raw)).toEqual({
        ok: false,
        reason: 'invalid_summary',
      });
    });
  });

  describe('tag handling', () => {
    it('drops one bad tag among good ones and counts it', () => {
      expect(
        parseSummaryOutput({
          summary: 'ok',
          tags: ['react', '<script>', 'nestjs'],
        }),
      ).toEqual({
        ok: true,
        summary: 'ok',
        tags: ['react', 'nestjs'],
        droppedTagCount: 1,
      });
    });

    it.each([
      ['a number', 7],
      ['null', null],
      ['an object', { a: 1 }],
      ['empty', ''],
      ['whitespace only', '   '],
      ['too long', 'a'.repeat(TAG_MAX_LENGTH + 1)],
      ['starting with a symbol', '#react'],
      ['starting with a dot', '.NET'],
      ['containing angle brackets', 'a<b>'],
      ['containing a newline', 'line\nbreak'],
    ])('drops a tag that is %s', (_label, bad) => {
      const result = parseSummaryOutput({ summary: 'ok', tags: ['good', bad] });
      expect(result).toEqual({
        ok: true,
        summary: 'ok',
        tags: ['good'],
        droppedTagCount: 1,
      });
    });

    it.each([
      'C++',
      'C#',
      'node.js',
      'CI/CD',
      'React Native',
      'type-script',
      'ASP.NET',
      'Ünïcode',
      'a',
    ])('keeps the valid tag %s', (tag) => {
      expect(parseSummaryOutput({ summary: 'ok', tags: [tag] })).toMatchObject({
        ok: true,
        tags: [tag],
      });
    });

    it('keeps a tag of exactly the max length', () => {
      const tag = 'a'.repeat(TAG_MAX_LENGTH);
      expect(parseSummaryOutput({ summary: 'ok', tags: [tag] })).toMatchObject({
        ok: true,
        tags: [tag],
      });
    });

    it('deduplicates case-insensitively and keeps the first spelling', () => {
      const result = parseSummaryOutput({
        summary: 'ok',
        tags: ['React', 'react', 'REACT', 'nestjs'],
      });
      expect(result).toEqual({
        ok: true,
        summary: 'ok',
        tags: ['React', 'nestjs'],
        droppedTagCount: 0,
      });
    });

    it('cuts to the max number of tags without counting them as dropped', () => {
      const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const result = parseSummaryOutput({ summary: 'ok', tags });
      expect(result).toEqual({
        ok: true,
        summary: 'ok',
        tags: tags.slice(0, MAX_TAGS),
        droppedTagCount: 0,
      });
    });

    it('rejects when every tag is invalid', () => {
      expect(
        parseSummaryOutput({ summary: 'ok', tags: ['<a>', '', 5] }),
      ).toEqual({
        ok: false,
        reason: 'no_valid_tags',
      });
    });

    it('rejects an empty tags array', () => {
      expect(parseSummaryOutput({ summary: 'ok', tags: [] })).toEqual({
        ok: false,
        reason: 'no_valid_tags',
      });
    });
  });
});
