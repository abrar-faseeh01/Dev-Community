import { jest } from '@jest/globals';
import { validateEnv } from './env.validation';

const base = {
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv — summarizer settings', () => {
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('applies defaults when nothing is set', () => {
    const env = validateEnv(base);
    expect(env.SUMMARIZER_PROVIDER).toBeUndefined();
    expect(env.SUMMARIZER_API_KEY).toBeUndefined();
    expect(env.SUMMARIZER_MODEL).toBe('gemini-3.5-flash-lite');
    expect(env.SUMMARIZER_TIMEOUT_MS).toBe(10000);
  });

  it('treats blank values (as in an unfilled .env line) like unset', () => {
    const env = validateEnv({
      ...base,
      SUMMARIZER_PROVIDER: '',
      SUMMARIZER_API_KEY: '',
      SUMMARIZER_MODEL: '  ',
      SUMMARIZER_TIMEOUT_MS: '',
    });
    expect(env.SUMMARIZER_PROVIDER).toBeUndefined();
    expect(env.SUMMARIZER_API_KEY).toBeUndefined();
    expect(env.SUMMARIZER_MODEL).toBe('gemini-3.5-flash-lite');
    expect(env.SUMMARIZER_TIMEOUT_MS).toBe(10000);
  });

  it('treats a whitespace-only key as no key and trims a real one', () => {
    expect(
      validateEnv({ ...base, SUMMARIZER_API_KEY: '   ' }).SUMMARIZER_API_KEY,
    ).toBeUndefined();
    expect(
      validateEnv({ ...base, SUMMARIZER_API_KEY: ' abc123 ' })
        .SUMMARIZER_API_KEY,
    ).toBe('abc123');
  });

  it.each(['mock', 'gemini'])('accepts provider %s', (provider) => {
    expect(
      validateEnv({ ...base, SUMMARIZER_PROVIDER: provider })
        .SUMMARIZER_PROVIDER,
    ).toBe(provider);
  });

  it('rejects an unknown provider', () => {
    expect(() =>
      validateEnv({ ...base, SUMMARIZER_PROVIDER: 'openai' }),
    ).toThrow('Environment validation failed');
  });

  it('lets SUMMARIZER_MODEL be changed on its own', () => {
    expect(
      validateEnv({ ...base, SUMMARIZER_MODEL: 'gemini-3.8-flash' })
        .SUMMARIZER_MODEL,
    ).toBe('gemini-3.8-flash');
  });

  it('parses the timeout from a string', () => {
    expect(
      validateEnv({ ...base, SUMMARIZER_TIMEOUT_MS: '5000' })
        .SUMMARIZER_TIMEOUT_MS,
    ).toBe(5000);
  });

  it.each(['999', '15001', '2500.5', 'abc'])('rejects timeout %s', (value) => {
    expect(() =>
      validateEnv({ ...base, SUMMARIZER_TIMEOUT_MS: value }),
    ).toThrow('Environment validation failed');
  });

  it.each(['1000', '15000'])('accepts the timeout bound %s', (value) => {
    expect(
      validateEnv({ ...base, SUMMARIZER_TIMEOUT_MS: value })
        .SUMMARIZER_TIMEOUT_MS,
    ).toBe(Number(value));
  });
});
