import { describe, expect, it } from 'bun:test';
import { HttpStatus } from '@nestjs/common';
import { I18nExceptionFilter } from './i18n-exception.filter';
import {
  LocalizedBadRequest,
  LocalizedConflict,
  LocalizedForbidden,
  LocalizedNotFound,
  LocalizedUnauthorized,
} from './localized.exception';
import { apiMessages, resolveMessage } from './messages';
import { resolveLocale } from './resolve-locale';

// ---------------------------------------------------------------------------
// resolveLocale
// ---------------------------------------------------------------------------
describe('resolveLocale', () => {
  it('returns en for undefined', () => expect(resolveLocale(undefined)).toBe('en'));
  it('returns en for empty string', () => expect(resolveLocale('')).toBe('en'));
  it('returns en for English preference', () => expect(resolveLocale('en-US,en;q=0.9')).toBe('en'));
  it('returns ko for ko-KR', () => expect(resolveLocale('ko-KR,ko;q=0.9,en-US;q=0.8')).toBe('ko'));
  it('returns ko for bare ko', () => expect(resolveLocale('ko')).toBe('ko'));
  it('returns en for French', () => expect(resolveLocale('fr-FR,fr;q=0.9')).toBe('en'));
  it('honours q-values: en;q=0.9 vs ko;q=0.8 → en', () =>
    expect(resolveLocale('en;q=0.9,ko;q=0.8')).toBe('en'));
  it('honours q-values: ko;q=1 beats en;q=0.5', () =>
    expect(resolveLocale('en;q=0.5,ko;q=1')).toBe('ko'));
});

// ---------------------------------------------------------------------------
// resolveMessage — plain strings
// ---------------------------------------------------------------------------
describe('resolveMessage — plain strings', () => {
  it('returns english message for auth.authRequired', () =>
    expect(resolveMessage('en', 'auth.authRequired')).toBe('Authentication required'));
  it('returns korean message for auth.authRequired', () =>
    expect(resolveMessage('ko', 'auth.authRequired')).toBe('인증이 필요합니다'));
  it('falls back to the key for an unknown key', () =>
    expect(resolveMessage('en', 'nonexistent.key')).toBe('nonexistent.key'));
});

// ---------------------------------------------------------------------------
// resolveMessage — parameterised messages
// ---------------------------------------------------------------------------
describe('resolveMessage — parameterised', () => {
  it('interpolates username in en', () =>
    expect(resolveMessage('en', 'auth.usernameTaken', { username: 'alice' })).toBe(
      'Username "alice" is taken',
    ));
  it('interpolates username in ko', () =>
    expect(resolveMessage('ko', 'auth.usernameTaken', { username: 'alice' })).toBe(
      '"alice" 사용자명은 이미 사용 중입니다',
    ));
  it('interpolates max in en', () =>
    expect(resolveMessage('en', 'apps.memoryExceedsMax', { max: 4096 })).toBe(
      'Memory limit may not exceed 4096 MB',
    ));
  it('interpolates max in ko', () =>
    expect(resolveMessage('ko', 'apps.memoryExceedsMax', { max: 4096 })).toBe(
      '메모리 한도는 4096 MB를 초과할 수 없습니다',
    ));
  it('interpolates allowed expiry days in en', () =>
    expect(resolveMessage('en', 'tokens.expiresInDaysInvalid', { allowed: '30, 90, 365' })).toBe(
      'expiresInDays must be one of 30, 90, 365, or omitted for no expiry',
    ));
});

// ---------------------------------------------------------------------------
// LocalizedException subclasses — status codes
// ---------------------------------------------------------------------------
describe('LocalizedException subclasses', () => {
  it('LocalizedBadRequest has status 400', () =>
    expect(new LocalizedBadRequest('auth.passwordTooShort').getStatus()).toBe(
      HttpStatus.BAD_REQUEST,
    ));
  it('LocalizedUnauthorized has status 401', () =>
    expect(new LocalizedUnauthorized('auth.authRequired').getStatus()).toBe(
      HttpStatus.UNAUTHORIZED,
    ));
  it('LocalizedForbidden has status 403', () =>
    expect(new LocalizedForbidden('auth.adminRequired').getStatus()).toBe(HttpStatus.FORBIDDEN));
  it('LocalizedNotFound has status 404', () =>
    expect(new LocalizedNotFound('apps.notFound').getStatus()).toBe(HttpStatus.NOT_FOUND));
  it('LocalizedConflict has status 409', () =>
    expect(new LocalizedConflict('auth.usernameTaken', { username: 'x' }).getStatus()).toBe(
      HttpStatus.CONFLICT,
    ));
  it('stores messageKey and params', () => {
    const ex = new LocalizedBadRequest('apps.memoryExceedsMax', { max: 512 });
    expect(ex.messageKey).toBe('apps.memoryExceedsMax');
    expect(ex.messageParams).toEqual({ max: 512 });
  });
});

// ---------------------------------------------------------------------------
// I18nExceptionFilter — end-to-end via mock host
// ---------------------------------------------------------------------------
describe('I18nExceptionFilter', () => {
  function makeHost(acceptLanguage: string) {
    const body: Record<string, unknown> = {};
    const res = {
      status(code: number) {
        body['statusCode'] = code;
        return res;
      },
      json(data: Record<string, unknown>) {
        Object.assign(body, data);
      },
    };
    const req = { headers: { 'accept-language': acceptLanguage } };
    return {
      body,
      host: {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
      } as never,
    };
  }

  const filter = new I18nExceptionFilter();

  it('translates LocalizedException to en', () => {
    const { body, host } = makeHost('en-US');
    filter.catch(new LocalizedUnauthorized('auth.invalidCredentials'), host);
    expect(body['message']).toBe('Invalid username or password');
    expect(body['statusCode']).toBe(401);
    expect(body['code']).toBe('auth.invalidCredentials');
  });

  it('translates LocalizedException to ko', () => {
    const { body, host } = makeHost('ko-KR,ko;q=0.9');
    filter.catch(new LocalizedUnauthorized('auth.invalidCredentials'), host);
    expect(body['message']).toBe('사용자명 또는 비밀번호가 올바르지 않습니다');
  });

  it('translates parameterised message', () => {
    const { body, host } = makeHost('ko');
    filter.catch(new LocalizedConflict('auth.usernameTaken', { username: 'bob' }), host);
    expect(body['message']).toBe('"bob" 사용자명은 이미 사용 중입니다');
    expect(body['statusCode']).toBe(409);
  });

  it('passes through plain HttpException unchanged', () => {
    const { body, host } = makeHost('ko');
    const { HttpException } = require('@nestjs/common');
    filter.catch(new HttpException({ statusCode: 422, message: 'Custom error' }, 422), host);
    expect(body['statusCode']).toBe(422);
    expect(body['message']).toBe('Custom error');
  });

  it('returns 500 with locale-aware internalError for unknown exceptions', () => {
    const { body: enBody, host: enHost } = makeHost('en');
    filter.catch(new Error('boom'), enHost);
    expect(enBody['statusCode']).toBe(500);
    expect(enBody['message']).toBe('Internal server error');

    const { body: koBody, host: koHost } = makeHost('ko');
    filter.catch(new Error('boom'), koHost);
    expect(koBody['message']).toBe('서버 내부 오류가 발생했습니다');
  });
});

// ---------------------------------------------------------------------------
// Catalog completeness — every key in en must have a ko counterpart
// ---------------------------------------------------------------------------
describe('Catalog completeness', () => {
  function collectLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string' || typeof v === 'function') {
        keys.push(full);
      } else if (typeof v === 'object' && v !== null) {
        keys.push(...collectLeafKeys(v as Record<string, unknown>, full));
      }
    }
    return keys;
  }

  it('ko has all keys that en has', () => {
    const enKeys = collectLeafKeys(apiMessages.en as unknown as Record<string, unknown>);
    const koKeys = new Set(collectLeafKeys(apiMessages.ko as unknown as Record<string, unknown>));
    const missing = enKeys.filter((k) => !koKeys.has(k));
    expect(missing).toEqual([]);
  });
});
