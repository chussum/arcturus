import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeEnvValue, parseEnvFile } from './env-file';

describe('parseEnvFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcturus-envfile-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (contents: string): string => {
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, contents);
    return file;
  };

  test('parses KEY=value, export prefix, quotes, and skips comments/blanks', () => {
    const file = write(
      [
        '# a comment',
        '',
        'FOO=bar',
        'export TOKEN=abc123',
        'QUOTED="hello world"',
        "SINGLE='single quoted'",
        'EMPTY=',
        'no_equals_here',
      ].join('\n'),
    );

    expect(parseEnvFile(file)).toEqual({
      FOO: 'bar',
      TOKEN: 'abc123',
      QUOTED: 'hello world',
      SINGLE: 'single quoted',
      EMPTY: '',
    });
  });

  test('keeps values containing = intact', () => {
    expect(parseEnvFile(write('DATABASE_URL=postgres://u:p@host/db?ssl=true'))).toEqual({
      DATABASE_URL: 'postgres://u:p@host/db?ssl=true',
    });
  });

  test('throws on an invalid key', () => {
    expect(() => parseEnvFile(write('1BAD=x'))).toThrow(/invalid env key/);
  });

  test('strips whitespace-preceded inline comments and trims, preserving inner # and quotes', () => {
    const file = write(
      [
        'TOKEN=val # 주석',
        'COLOR=#fff',
        'PW=ab#cd',
        'URL=http://x#frag',
        'QUOTED="a # b" # 주석',
        'SPACED=  trimmed  ',
        'INNER_SPACE="  keep me  "',
        'UNTERMINATED="oops # c',
      ].join('\n'),
    );

    expect(parseEnvFile(file)).toEqual({
      TOKEN: 'val',
      COLOR: '#fff',
      PW: 'ab#cd',
      URL: 'http://x#frag',
      QUOTED: 'a # b',
      SPACED: 'trimmed',
      INNER_SPACE: '  keep me  ',
      UNTERMINATED: '"oops',
    });
  });
});

describe('normalizeEnvValue', () => {
  test('trims and strips a whitespace-preceded inline comment', () => {
    expect(normalizeEnvValue('  val # note ')).toBe('val');
    expect(normalizeEnvValue('val')).toBe('val');
    expect(normalizeEnvValue('')).toBe('');
  });

  test('preserves a # that is part of the value (no preceding whitespace)', () => {
    expect(normalizeEnvValue('#fff')).toBe('#fff');
    expect(normalizeEnvValue('ab#cd')).toBe('ab#cd');
    expect(normalizeEnvValue('http://x#frag')).toBe('http://x#frag');
  });

  test('preserves the inner content of a quoted value verbatim', () => {
    expect(normalizeEnvValue('"a # b" # note')).toBe('a # b');
    expect(normalizeEnvValue("'  keep  '")).toBe('  keep  ');
  });

  test('is idempotent for unquoted values', () => {
    const once = normalizeEnvValue('val # note');
    expect(normalizeEnvValue(once)).toBe(once);
  });
});
