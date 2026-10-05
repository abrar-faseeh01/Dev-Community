import {
  BadRequestException,
  INestApplication,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ErrorRequestHandler, RequestHandler } from 'express';

// Nest's own default JSON limit is also 100kb; it is set here so the number is
// visible and covered by a test. The longest legitimate payload (a 20,000
// character post, or a profile with 20 portfolio projects) is well under it.
export const JSON_BODY_LIMIT = '100kb';

// Every endpoint takes JSON. Nest would also parse urlencoded bodies by
// default, and a urlencoded form POST is a request a browser sends cross-site
// without a CORS preflight, so refusing it here keeps cookie-authenticated
// writes from being forgeable by a plain HTML form.
//
// Only a request that actually carries a body is checked: a bodyless POST
// (e.g. logout) has Content-Length 0 and no Content-Type, and must pass.
export const rejectNonJsonBody: RequestHandler = (req, _res, next) => {
  const length = Number(req.headers['content-length'] ?? 0);
  const chunked = req.headers['transfer-encoding'] !== undefined;
  if ((length > 0 || chunked) && !req.is('json')) {
    return next(
      new UnsupportedMediaTypeException(
        'Request body must be application/json',
      ),
    );
  }
  next();
};

// Runs right after the JSON parser. This has to happen here and not in the
// exception filter: Nest turns the parser's SyntaxError into a
// BadRequestException(err.message) before any filter sees it, and Node's JSON
// message quotes a fragment of the body (for a login body that can be part of
// the password). So the message is never read; the parser's error `type` picks
// a fixed one instead.
export const translateBodyParserError: ErrorRequestHandler = (
  err,
  _req,
  _res,
  next,
) => {
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.too.large') {
    return next(new PayloadTooLargeException('Request body too large'));
  }
  if (type === 'entity.parse.failed') {
    return next(new BadRequestException('Malformed JSON body'));
  }
  next(err);
};

// Order matters: the guard must run before the parsers, and the translator
// directly after the JSON parser so it sees the parser's errors.
export function configureBodyParsing(app: INestApplication): void {
  app.use(rejectNonJsonBody);
  // useBodyParser exists on the Express application type, not on the generic
  // INestApplication that configureApp() is typed with; the app is always Express.
  (app as NestExpressApplication).useBodyParser('json', {
    limit: JSON_BODY_LIMIT,
  });
  app.use(translateBodyParserError);
}
