import { jest } from '@jest/globals';
import { GeminiSummarizer } from './gemini-summarizer';
import { MockSummarizer } from './mock-summarizer';
import { createSummarizer } from './summarizer.factory';

const KEY = 'secret-key-value';

function setup() {
  const logger = { log: jest.fn(), warn: jest.fn() };
  const base = { model: 'gemini-3.5-flash-lite', timeoutMs: 10000 };
  return { logger, base };
}

describe('createSummarizer (provider selection)', () => {
  it('uses the mock with a warning when no key is set', () => {
    const { logger, base } = setup();
    const summarizer = createSummarizer(base, logger);
    expect(summarizer).toBeInstanceOf(MockSummarizer);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('treats the blank key %j as no key', (apiKey) => {
    const { logger, base } = setup();
    expect(createSummarizer({ ...base, apiKey }, logger)).toBeInstanceOf(
      MockSummarizer,
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('uses the mock when the provider is "mock", even with a key, and does not warn', () => {
    const { logger, base } = setup();
    const summarizer = createSummarizer(
      { ...base, provider: 'mock', apiKey: KEY },
      logger,
    );
    expect(summarizer).toBeInstanceOf(MockSummarizer);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('uses the mock with a warning when provider is "gemini" but the key is blank', () => {
    const { logger, base } = setup();
    const summarizer = createSummarizer(
      { ...base, provider: 'gemini', apiKey: '  ' },
      logger,
    );
    expect(summarizer).toBeInstanceOf(MockSummarizer);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('uses Gemini when provider is "gemini" and a key is set', () => {
    const { logger, base } = setup();
    const summarizer = createSummarizer(
      { ...base, provider: 'gemini', apiKey: KEY },
      logger,
    );
    expect(summarizer).toBeInstanceOf(GeminiSummarizer);
    expect(summarizer.source).toBe('gemini');
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('uses Gemini when only a key is set (provider unset)', () => {
    const { logger, base } = setup();
    expect(
      createSummarizer({ ...base, apiKey: KEY }, logger),
    ).toBeInstanceOf(GeminiSummarizer);
  });

  it('never writes the key to the log', () => {
    const { logger, base } = setup();
    createSummarizer({ ...base, provider: 'gemini', apiKey: KEY }, logger);
    createSummarizer({ ...base, provider: 'mock', apiKey: KEY }, logger);
    const logged = JSON.stringify([
      ...logger.log.mock.calls,
      ...logger.warn.mock.calls,
    ]);
    expect(logged).not.toContain(KEY);
  });

  it('logs the model name for Gemini so a model switch is visible', () => {
    const { logger, base } = setup();
    createSummarizer(
      { ...base, model: 'gemini-3.8-flash', apiKey: KEY },
      logger,
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('gemini-3.8-flash'),
    );
  });
});
