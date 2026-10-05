import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';

// A 4xx carried by something that is not an HttpException (an http-errors
// object from a middleware, for instance). Anything else is not trusted to
// choose its own status.
function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status, statusCode } = exception as {
    status?: unknown;
    statusCode?: unknown;
  };
  const candidate = status ?? statusCode;
  return Number.isInteger(candidate) &&
    (candidate as number) >= 400 &&
    (candidate as number) < 500
    ? (candidate as number)
    : undefined;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const fallbackStatus = clientErrorStatus(exception);
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : (fallbackStatus ?? HttpStatus.INTERNAL_SERVER_ERROR);

    let message = 'Internal server error';
    let errors: string[] = [];

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as { message?: string | string[] };
        if (Array.isArray(b.message)) {
          errors = b.message; // e.g. class-validator's list of field errors
          message = 'Validation failed';
        } else {
          message = b.message ?? exception.message;
        }
      }
    } else if (fallbackStatus !== undefined) {
      // The standard reason phrase for the status, never exception.message:
      // a library's message can quote the request (a JSON parse error quotes
      // part of the body).
      message = STATUS_CODES[fallbackStatus] ?? 'Request failed';
    }

    if (statusCode >= 500) {
      this.logServerError(exception, req, statusCode);
    }

    res
      .status(statusCode)
      .json({ success: false, statusCode, message, errors });
  }

  // Name, code, method and path only. Not the message, the stack, the query
  // string or the body: a driver's message can hold user data (an E11000
  // duplicate-key error quotes the email), and the stack starts with it.
  private logServerError(exception: unknown, req: Request, statusCode: number) {
    const name = exception instanceof Error ? exception.name : typeof exception;
    const rawCode = (exception as { code?: unknown } | null)?.code;
    const code =
      typeof rawCode === 'string' || typeof rawCode === 'number'
        ? ` code=${rawCode}`
        : '';
    this.logger.error(
      `${req?.method} ${req?.path} -> ${statusCode} ${name}${code}`,
    );
  }
}
