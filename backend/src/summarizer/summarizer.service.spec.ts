import { jest } from '@jest/globals';
import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Summarizer, SummarizerError } from './summarizer.interface';
import {
  MAX_BODY_LENGTH,
  MIN_BODY_LENGTH,
  SummarizerService,
} from './summarizer.service';

const TITLE = 'A post title';
const BODY = 'a'.repeat(300);
const VALID_OUTPUT = { summary: 'A short summary.', tags: ['react', 'nestjs'] };

function setup(source: Summarizer['source'] = 'mock') {
  const summarize = jest.fn<Summarizer['summarize']>();
  const provider: Summarizer = { source, summarize };
  return { service: new SummarizerService(provider), summarize };
}

describe('SummarizerService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('input length', () => {
    it.each([
      ['empty', ''],
      ['one character short of the minimum', 'a'.repeat(MIN_BODY_LENGTH - 1)],
      [
        'short once surrounding whitespace is trimmed',
        `   ${'a'.repeat(150)}${' '.repeat(100)}`,
      ],
    ])(
      'rejects a body that is %s with 422 and never calls the provider',
      async (_label, body) => {
        const { service, summarize } = setup();
        await expect(
          service.summarize({ title: TITLE, body }),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(summarize).not.toHaveBeenCalled();
      },
    );

    it('accepts a body of exactly the minimum length', async () => {
      const { service, summarize } = setup();
      summarize.mockResolvedValue(VALID_OUTPUT);
      await expect(
        service.summarize({ title: TITLE, body: 'a'.repeat(MIN_BODY_LENGTH) }),
      ).resolves.toMatchObject({ truncated: false });
    });

    it('truncates a body over the maximum and flags it', async () => {
      const { service, summarize } = setup();
      summarize.mockResolvedValue(VALID_OUTPUT);
      const result = await service.summarize({
        title: TITLE,
        body: 'a'.repeat(MAX_BODY_LENGTH + 1000),
      });
      expect(summarize).toHaveBeenCalledWith({
        title: TITLE,
        body: 'a'.repeat(MAX_BODY_LENGTH),
      });
      expect(result.truncated).toBe(true);
    });

    it('does not leave half an emoji at the cut point', async () => {
      const { service, summarize } = setup();
      summarize.mockResolvedValue(VALID_OUTPUT);
      // The emoji's two UTF-16 halves straddle index MAX_BODY_LENGTH.
      const body = `${'a'.repeat(MAX_BODY_LENGTH - 1)}😀${'a'.repeat(50)}`;
      await service.summarize({ title: TITLE, body });
      const sent = summarize.mock.calls[0][0].body;
      expect(sent).toBe('a'.repeat(MAX_BODY_LENGTH - 1));
    });

    it('does not flag a body of exactly the maximum length', async () => {
      const { service, summarize } = setup();
      summarize.mockResolvedValue(VALID_OUTPUT);
      const result = await service.summarize({
        title: TITLE,
        body: 'a'.repeat(MAX_BODY_LENGTH),
      });
      expect(summarize).toHaveBeenCalledWith({
        title: TITLE,
        body: 'a'.repeat(MAX_BODY_LENGTH),
      });
      expect(result.truncated).toBe(false);
    });
  });

  describe('payload', () => {
    it('sends exactly { title, body }, trimmed, and nothing else', async () => {
      const { service, summarize } = setup();
      summarize.mockResolvedValue(VALID_OUTPUT);
      const withExtras = {
        title: TITLE,
        body: ` ${'a'.repeat(250)} `,
        authorId: 'abc123',
        authorEmail: 'someone@example.com',
      };

      await service.summarize(withExtras);

      expect(summarize).toHaveBeenCalledTimes(1);
      expect(summarize).toHaveBeenCalledWith({
        title: TITLE,
        body: 'a'.repeat(250),
      });
    });
  });

  describe('success', () => {
    it('returns the validated summary, tags, source and truncated flag', async () => {
      const { service, summarize } = setup('gemini');
      summarize.mockResolvedValue(VALID_OUTPUT);
      await expect(
        service.summarize({ title: TITLE, body: BODY }),
      ).resolves.toEqual({
        summary: 'A short summary.',
        tags: ['react', 'nestjs'],
        source: 'gemini',
        truncated: false,
      });
    });

    it('drops an invalid tag and still succeeds', async () => {
      const { service, summarize } = setup();
      summarize.mockResolvedValue({
        summary: 'ok',
        tags: ['react', '<script>', 'nestjs'],
      });
      await expect(
        service.summarize({ title: TITLE, body: BODY }),
      ).resolves.toMatchObject({
        tags: ['react', 'nestjs'],
      });
    });
  });

  describe('output validation (502)', () => {
    it.each([
      ['every tag is invalid', { summary: 'ok', tags: ['<a>', ''] }],
      ['the tags array is empty', { summary: 'ok', tags: [] }],
      ['the summary is missing', { tags: ['react'] }],
      ['the summary is empty', { summary: '', tags: ['react'] }],
      ['the output is null', null],
      ['the output is a string', 'just text'],
    ])('returns 502 when %s', async (_label, raw) => {
      const { service, summarize } = setup();
      summarize.mockResolvedValue(raw);
      await expect(
        service.summarize({ title: TITLE, body: BODY }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('provider failures', () => {
    it('maps timeout to 504', async () => {
      const { service, summarize } = setup();
      summarize.mockRejectedValue(new SummarizerError('timeout', 'slow'));
      await expect(
        service.summarize({ title: TITLE, body: BODY }),
      ).rejects.toBeInstanceOf(GatewayTimeoutException);
    });

    it('maps malformed to 502', async () => {
      const { service, summarize } = setup();
      summarize.mockRejectedValue(new SummarizerError('malformed', 'bad json'));
      await expect(
        service.summarize({ title: TITLE, body: BODY }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it.each([undefined, 429, 500])(
      'maps unavailable (upstream status %s) to 503',
      async (status) => {
        const { service, summarize } = setup();
        summarize.mockRejectedValue(
          new SummarizerError('unavailable', 'down', status),
        );
        await expect(
          service.summarize({ title: TITLE, body: BODY }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      },
    );

    it('does not leak the provider error message into the HTTP error', async () => {
      const { service, summarize } = setup();
      summarize.mockRejectedValue(
        new SummarizerError('unavailable', 'secret-internal-detail', 500),
      );
      const error = await service
        .summarize({ title: TITLE, body: BODY })
        .catch((e: unknown) => e);
      expect((error as Error).message).not.toContain('secret-internal-detail');
    });

    it('rethrows unexpected errors unchanged so they surface as 500, and logs them', async () => {
      const { service, summarize } = setup();
      const boom = new Error('boom');
      summarize.mockRejectedValue(boom);
      await expect(
        service.summarize({ title: TITLE, body: BODY }),
      ).rejects.toBe(boom);
      expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
    });
  });
});
