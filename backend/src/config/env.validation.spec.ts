import { jest } from '@jest/globals';
import { validateEnv } from './env.validation';

// The Zod schema is the only gate between a mistyped .env and a running server,
// so the rules that guard the session cookies are checked directly. validateEnv
// logs the field errors before it throws; that is silenced here.
const SECRET = 's'.repeat(40);
const REFRESH_SECRET = 'r'.repeat(40);

const base = {
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_SECRET: SECRET,
  JWT_REFRESH_SECRET: REFRESH_SECRET,
};

// Production needs FRONTEND_ORIGIN spelled out, so tests about other production
// rules start from this.
const prod = {
  ...base,
  NODE_ENV: 'production',
  FRONTEND_ORIGIN: 'https://app.example.com',
};

describe('validateEnv', () => {
  let errorLog: ReturnType<typeof spyOnConsoleError>;

  function spyOnConsoleError() {
    return jest.spyOn(console, 'error').mockImplementation(() => undefined);
  }

  // Which variables the last failed validation complained about, so a test
  // proves it was rejected for the reason it claims, not for some other one.
  const failedFields = () =>
    Object.keys(errorLog.mock.calls.at(-1)?.[1] as object);

  beforeEach(() => {
    errorLog = spyOnConsoleError();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fills in the session defaults', () => {
    const env = validateEnv(base);

    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_EXPIRES_IN).toBe('15m');
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe('7d');
    expect(env.COOKIE_REFRESH_PATH).toBe('/auth');
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('treats blank values as unset (a copied .env.example has them)', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: '',
      JWT_EXPIRES_IN: '',
      JWT_REFRESH_EXPIRES_IN: '  ',
      COOKIE_SECURE: '',
      COOKIE_REFRESH_PATH: '',
    });

    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_EXPIRES_IN).toBe('15m');
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe('7d');
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.COOKIE_REFRESH_PATH).toBe('/auth');
  });

  it('keeps explicit lifetimes', () => {
    const env = validateEnv({
      ...base,
      JWT_EXPIRES_IN: '30s',
      JWT_REFRESH_EXPIRES_IN: '60s',
    });

    expect(env.JWT_EXPIRES_IN).toBe('30s');
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe('60s');
  });

  describe('COOKIE_SECURE', () => {
    it('defaults to true in production', () => {
      expect(validateEnv(prod).COOKIE_SECURE).toBe(true);
    });

    it('reads the string "false" as false, not as a truthy string', () => {
      expect(
        validateEnv({ ...base, COOKIE_SECURE: 'false' }).COOKIE_SECURE,
      ).toBe(false);
    });

    it('can be switched on outside production', () => {
      expect(
        validateEnv({ ...base, COOKIE_SECURE: 'true' }).COOKIE_SECURE,
      ).toBe(true);
    });

    it('is rejected as false in production', () => {
      expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'false' })).toThrow(
        'Environment validation failed',
      );
      expect(failedFields()).toEqual(['COOKIE_SECURE']);
    });

    it('rejects anything but true/false', () => {
      expect(() => validateEnv({ ...base, COOKIE_SECURE: '1' })).toThrow();
      expect(() => validateEnv({ ...base, COOKIE_SECURE: 'yes' })).toThrow();
    });
  });

  describe('JWT_REFRESH_SECRET', () => {
    it('is required', () => {
      const { JWT_REFRESH_SECRET: _omitted, ...without } = base;
      expect(() => validateEnv(without)).toThrow();
    });

    it('must be at least 32 characters', () => {
      expect(() =>
        validateEnv({ ...base, JWT_REFRESH_SECRET: 'short' }),
      ).toThrow();
    });

    it('must differ from JWT_SECRET', () => {
      expect(() =>
        validateEnv({ ...base, JWT_REFRESH_SECRET: SECRET }),
      ).toThrow();
    });
  });

  describe('COOKIE_REFRESH_PATH', () => {
    it('accepts another absolute path', () => {
      expect(
        validateEnv({ ...base, COOKIE_REFRESH_PATH: '/api/auth' })
          .COOKIE_REFRESH_PATH,
      ).toBe('/api/auth');
    });

    it('rejects a path that does not start with /', () => {
      expect(() =>
        validateEnv({ ...base, COOKIE_REFRESH_PATH: 'auth' }),
      ).toThrow();
    });
  });

  describe('FRONTEND_ORIGIN', () => {
    it('falls back to the local frontend outside production', () => {
      expect(validateEnv(base).FRONTEND_ORIGIN).toBe('http://localhost:3001');
      expect(
        validateEnv({ ...base, FRONTEND_ORIGIN: '' }).FRONTEND_ORIGIN,
      ).toBe('http://localhost:3001');
    });

    it.each([
      'https://app.example.com',
      'http://localhost:3001',
      'https://app.example.com:8443',
    ])('accepts the exact origin %s', (origin) => {
      expect(
        validateEnv({ ...base, FRONTEND_ORIGIN: origin }).FRONTEND_ORIGIN,
      ).toBe(origin);
    });

    it.each([
      ['a wildcard', '*'],
      ['a trailing slash', 'http://localhost:3001/'],
      ['a path', 'https://app.example.com/app'],
      ['no scheme', 'app.example.com'],
      ['a non-http scheme', 'ftp://app.example.com'],
      ['a comma-separated list', 'https://a.example.com,https://b.example.com'],
    ])('rejects %s', (_label, origin) => {
      expect(() => validateEnv({ ...base, FRONTEND_ORIGIN: origin })).toThrow(
        'Environment validation failed',
      );
      expect(failedFields()).toEqual(['FRONTEND_ORIGIN']);
    });

    it('must be set explicitly in production', () => {
      expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
        'Environment validation failed',
      );
      expect(failedFields()).toEqual(['FRONTEND_ORIGIN']);
      expect(validateEnv(prod).FRONTEND_ORIGIN).toBe('https://app.example.com');
    });
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow();
  });
});
