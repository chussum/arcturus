import { HttpException, HttpStatus } from '@nestjs/common';
import { resolveMessage } from './messages';

/**
 * Base class for API errors that carry a catalog key instead of a literal
 * English string. The global I18nExceptionFilter intercepts these and
 * translates them via the Accept-Language header before sending the response.
 */
export class LocalizedException extends HttpException {
  constructor(
    /** Dot-separated catalog key, e.g. "auth.usernameTaken". */
    readonly messageKey: string,
    /** Named parameters forwarded to catalog message functions. */
    readonly messageParams: Record<string, unknown>,
    status: HttpStatus,
    /** HTTP error label, e.g. "Bad Request". */
    readonly errorLabel: string,
  ) {
    // Resolve English as the default message so that:
    //  - server logs show readable English text
    //  - any code catching the raw exception gets a real message
    //  - existing tests that check .toThrow('substring') keep working
    // The filter replaces this with the Accept-Language locale at response time.
    super(resolveMessage('en', messageKey, messageParams), status);
  }
}

/** 400 Bad Request */
export class LocalizedBadRequest extends LocalizedException {
  constructor(key: string, params: Record<string, unknown> = {}) {
    super(key, params, HttpStatus.BAD_REQUEST, 'Bad Request');
  }
}

/** 401 Unauthorized */
export class LocalizedUnauthorized extends LocalizedException {
  constructor(key: string, params: Record<string, unknown> = {}) {
    super(key, params, HttpStatus.UNAUTHORIZED, 'Unauthorized');
  }
}

/** 403 Forbidden */
export class LocalizedForbidden extends LocalizedException {
  constructor(key: string, params: Record<string, unknown> = {}) {
    super(key, params, HttpStatus.FORBIDDEN, 'Forbidden');
  }
}

/** 404 Not Found */
export class LocalizedNotFound extends LocalizedException {
  constructor(key: string, params: Record<string, unknown> = {}) {
    super(key, params, HttpStatus.NOT_FOUND, 'Not Found');
  }
}

/** 409 Conflict */
export class LocalizedConflict extends LocalizedException {
  constructor(key: string, params: Record<string, unknown> = {}) {
    super(key, params, HttpStatus.CONFLICT, 'Conflict');
  }
}
