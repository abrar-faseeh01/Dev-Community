import { jest } from '@jest/globals';
import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

// The filter is exercised with a fake response and request: it only reads the
// method and path from the request and calls status().json() on the response.
// What this cannot show is that the filter is registered globally and that a
// real body-parser error reaches it in this shape; test/request-limits.e2e-spec.ts
// proves both against the running app.

function run(
  exception: unknown,
  req = { method: 'POST', path: '/auth/login' },
) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => req,
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);

  return {
    statusCode: status.mock.calls[0][0] as number,
    body: json.mock.calls[0][0] as Record<string, unknown>,
  };
}

// What body-parser throws: an Error with a status, an `expose` flag and a type.
function httpError(status: number, message: string, type?: string) {
  return Object.assign(new Error(message), {
    status,
    statusCode: status,
    type,
  });
}

const spyOnError = () =>
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

describe('HttpExceptionFilter', () => {
  let errorLog: ReturnType<typeof spyOnError>;

  beforeEach(() => {
    errorLog = spyOnError();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HttpException', () => {
    it('keeps its status and message in the failure envelope', () => {
      const { statusCode, body } = run(new ForbiddenException('Nope'));

      expect(statusCode).toBe(403);
      expect(body).toEqual({
        success: false,
        statusCode: 403,
        message: 'Nope',
        errors: [],
      });
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('turns a validation message list into errors', () => {
      const { statusCode, body } = run(
        new BadRequestException([
          'email must be an email',
          'password too short',
        ]),
      );

      expect(statusCode).toBe(400);
      expect(body.message).toBe('Validation failed');
      expect(body.errors).toEqual([
        'email must be an email',
        'password too short',
      ]);
    });
  });

  describe('a non-HttpException carrying a 4xx status', () => {
    it('uses that status with the standard reason phrase, not its own message', () => {
      const { statusCode, body } = run(
        httpError(413, 'request entity too large', 'entity.too.large'),
      );

      expect(statusCode).toBe(413);
      expect(body).toEqual({
        success: false,
        statusCode: 413,
        message: 'Payload Too Large',
        errors: [],
      });
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('never echoes a message that quotes the request', () => {
      const { body } = run(
        httpError(
          400,
          `Unexpected token 'h', ..."password":hunter2}" is not valid JSON`,
        ),
      );

      expect(JSON.stringify(body)).not.toContain('hunter2');
      expect(body.message).toBe('Bad Request');
    });

    it('reads statusCode when status is absent', () => {
      const err = Object.assign(new Error('x'), { statusCode: 422 });
      expect(run(err).statusCode).toBe(422);
    });
  });

  describe('anything else', () => {
    it.each([
      ['a plain Error', new Error('connection string mongodb://user:pw@host')],
      ['an error with a 3xx status', httpError(302, 'moved')],
      ['an error with a 5xx status', httpError(503, 'upstream said secret')],
      ['an error with a non-integer status', httpError(400.5, 'odd')],
      ['a thrown string', 'boom'],
      ['null', null],
    ])('%s becomes a generic 500', (_label, exception) => {
      const { statusCode, body } = run(exception);

      expect(statusCode).toBe(500);
      expect(body).toEqual({
        success: false,
        statusCode: 500,
        message: 'Internal server error',
        errors: [],
      });
    });
  });

  describe('server error logging', () => {
    it('logs only the name, code, method and path', () => {
      const duplicateKey = Object.assign(
        new Error(
          'E11000 duplicate key error collection: app.users index: email_1 dup key: { email: "victim@example.test" }',
        ),
        { name: 'MongoServerError', code: 11000 },
      );

      run(duplicateKey, { method: 'POST', path: '/auth/signup' });

      expect(errorLog).toHaveBeenCalledTimes(1);
      const line = String(errorLog.mock.calls[0][0]);
      expect(line).toBe('POST /auth/signup -> 500 MongoServerError code=11000');
      expect(line).not.toContain('victim@example.test');
      expect(errorLog.mock.calls[0]).toHaveLength(1); // no stack argument
    });

    it('omits the code when there is none and handles a non-Error', () => {
      run(new Error('x'));
      run('boom', { method: 'GET', path: '/posts' });

      expect(errorLog.mock.calls[0][0]).toBe('POST /auth/login -> 500 Error');
      expect(errorLog.mock.calls[1][0]).toBe('GET /posts -> 500 string');
    });

    it('logs a 5xx HttpException too, but never a 4xx', () => {
      run(new InternalServerErrorException('Could not save'));
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog.mock.calls[0][0]).toContain(
        'InternalServerErrorException',
      );

      run(new ForbiddenException());
      run(httpError(413, 'big'));
      expect(errorLog).toHaveBeenCalledTimes(1);
    });
  });
});
