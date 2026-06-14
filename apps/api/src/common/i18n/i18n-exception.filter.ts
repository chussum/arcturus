import { type ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import { LocalizedException } from './localized.exception';
import { resolveMessage } from './messages';
import { resolveLocale } from './resolve-locale';

/**
 * Global exception filter that translates LocalizedException messages
 * into the language requested by the client's Accept-Language header.
 *
 * Non-localized HttpExceptions (Nest internals, throttler 429, etc.) are
 * passed through unchanged so their behaviour is unaffected.
 *
 * Unknown errors become a generic 500 without leaking internal details.
 *
 * Note: the gateway middleware runs before Nest's request pipeline, so
 * Express-level errors (malformed URIs, proxy failures) are never seen here.
 */
@Catch()
export class I18nExceptionFilter implements Pick<BaseExceptionFilter, 'catch'> {
  private readonly logger = new Logger(I18nExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const locale = resolveLocale(req.headers['accept-language']);

    if (exception instanceof LocalizedException) {
      const status = exception.getStatus();
      const message = resolveMessage(locale, exception.messageKey, exception.messageParams);
      res.status(status).json({
        statusCode: status,
        error: exception.errorLabel,
        message,
        // Stable programmatic key — lets clients map to their own strings if needed.
        code: exception.messageKey,
      });
      return;
    }

    if (exception instanceof HttpException) {
      // Preserve the original NestJS / library error body as-is.
      const status = exception.getStatus();
      const body = exception.getResponse();
      res
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    // Unexpected errors: log internally, never expose stack traces.
    this.logger.error(
      `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    const message = resolveMessage(locale, 'common.internalError');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message,
      code: 'common.internalError',
    });
  }
}
