import { jest } from '@jest/globals';
import {
  GEMINI_ENDPOINT,
  GeminiSummarizer,
  NO_MEANING_SUMMARY,
} from './gemini-summarizer';
import { SummarizerInput } from './summarizer.interface';

const API_KEY = 'test-key-123';
const MODEL = 'gemini-3.5-flash-lite';
const INPUT: SummarizerInput = {
  title: 'Using React Query',
  body: 'A body about caching.',
};

function interaction(text: string, status = 'completed') {
  return {
    id: 'i1',
    status,
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function build(fetchFn: typeof fetch, timeoutMs = 1000) {
  return new GeminiSummarizer({
    apiKey: API_KEY,
    model: MODEL,
    timeoutMs,
    fetchFn,
  });
}

describe('GeminiSummarizer', () => {
  it('identifies itself as the gemini source', () => {
    expect(build(jest.fn<typeof fetch>()).source).toBe('gemini');
  });

  describe('success', () => {
    it('returns the parsed JSON from the model output step', async () => {
      const output = { summary: 'Short.', tags: ['React'] };
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(interaction(JSON.stringify(output))));
      await expect(build(fetchFn).summarize(INPUT)).resolves.toEqual(output);
    });

    it('returns whatever JSON the model produced without validating it (the service does that)', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(interaction(JSON.stringify(['not', 'an', 'object']))),
        );
      await expect(build(fetchFn).summarize(INPUT)).resolves.toEqual([
        'not',
        'an',
        'object',
      ]);
    });
  });

  describe('request', () => {
    it('carries only title, body and the model name, with the key in a header only', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(interaction('{"summary":"s","tags":["x"]}')),
        );
      const withExtras = {
        ...INPUT,
        authorEmail: 'someone@example.com',
        authorId: 'abc123',
      } as unknown as SummarizerInput;

      await build(fetchFn).summarize(withExtras);

      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe(GEMINI_ENDPOINT);
      const rawBody = init?.body as string;
      const sent = JSON.parse(rawBody) as Record<string, unknown>;

      expect(sent.model).toBe(MODEL);
      expect(JSON.parse(sent.input as string)).toEqual({
        title: INPUT.title,
        body: INPUT.body,
      });
      expect(sent.store).toBe(false);
      expect(rawBody).not.toContain('someone@example.com');
      expect(rawBody).not.toContain('abc123');
      expect(rawBody).not.toContain(API_KEY);

      const headers = init?.headers as Record<string, string>;
      expect(headers['x-goog-api-key']).toBe(API_KEY);
      expect(init?.method).toBe('POST');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('tells the model exactly what to say for a post with no meaningful content', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(interaction('{"summary":"s","tags":["x"]}')),
        );
      await build(fetchFn).summarize(INPUT);

      const sent = JSON.parse(fetchFn.mock.calls[0][1]?.body as string) as {
        system_instruction: string;
      };
      expect(sent.system_instruction).toContain(
        `"summary" to exactly "${NO_MEANING_SUMMARY}"`,
      );
      expect(sent.system_instruction).toContain('"tags" to ["general"]');
      // The wording the instruction replaces must not be the one asked for.
      expect(NO_MEANING_SUMMARY).toBe(
        'This post contains random and no meaningful content',
      );
    });

    it('asks for JSON output with a schema', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(interaction('{"summary":"s","tags":["x"]}')),
        );
      await build(fetchFn).summarize(INPUT);

      const sent = JSON.parse(fetchFn.mock.calls[0][1]?.body as string) as {
        response_format: {
          type: string;
          mime_type: string;
          schema: { required: string[] };
        };
      };
      expect(sent.response_format.type).toBe('text');
      expect(sent.response_format.mime_type).toBe('application/json');
      expect(sent.response_format.schema.required).toEqual(['summary', 'tags']);
    });
  });

  describe('timeout', () => {
    it('aborts a hanging request and reports a timeout', async () => {
      const hanging = jest.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal?.reason),
            );
          }),
      );
      await expect(build(hanging, 20).summarize(INPUT)).rejects.toMatchObject({
        kind: 'timeout',
      });
    });

    it('maps an abort error from fetch to a timeout', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockRejectedValue(
          new DOMException('The operation was aborted.', 'AbortError'),
        );
      await expect(build(fetchFn).summarize(INPUT)).rejects.toMatchObject({
        kind: 'timeout',
      });
    });
  });

  describe('unavailable', () => {
    it.each([429, 500, 503, 401, 404])(
      'maps HTTP %s to unavailable and keeps the status',
      async (status) => {
        const fetchFn = jest
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse({ error: 'x' }, status));
        await expect(build(fetchFn).summarize(INPUT)).rejects.toMatchObject({
          kind: 'unavailable',
          status,
        });
      },
    );

    it('maps a network failure to unavailable', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError('fetch failed'));
      await expect(build(fetchFn).summarize(INPUT)).rejects.toMatchObject({
        kind: 'unavailable',
      });
    });

    it('maps a failed interaction to unavailable', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ status: 'failed', steps: [] }));
      await expect(build(fetchFn).summarize(INPUT)).rejects.toMatchObject({
        kind: 'unavailable',
      });
    });

    it('does not put the upstream body or the key in the error message', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ error: 'secret upstream detail' }, 500),
        );
      const error = await build(fetchFn)
        .summarize(INPUT)
        .catch((e: Error) => e);
      expect((error as Error).message).not.toContain('secret upstream detail');
      expect((error as Error).message).not.toContain(API_KEY);
    });
  });

  describe('malformed', () => {
    it('rejects a response body that is not JSON', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('<html>oops</html>'));
      await expect(build(fetchFn).summarize(INPUT)).rejects.toMatchObject({
        kind: 'malformed',
      });
    });

    it('rejects an incomplete interaction (for example cut off by the token limit)', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(interaction('{"summary":"cut', 'incomplete')),
        );
      await expect(build(fetchFn).summarize(INPUT)).rejects.toMatchObject({
        kind: 'malformed',
      });
    });

    it.each([
      ['no steps', { status: 'completed', steps: [] }],
      ['no steps field', { status: 'completed' }],
      [
        'no text content',
        { status: 'completed', steps: [{ type: 'model_output', content: [] }] },
      ],
      ['a non-object body', ['x']],
    ])('rejects %s', async (_label, payload) => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(payload));
      await expect(build(fetchFn).summarize(INPUT)).rejects.toMatchObject({
        kind: 'malformed',
      });
    });

    it('rejects model text that is not valid JSON', async () => {
      const fetchFn = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(interaction('Sure! Here is your summary:')),
        );
      await expect(build(fetchFn).summarize(INPUT)).rejects.toMatchObject({
        kind: 'malformed',
      });
    });
  });
});
