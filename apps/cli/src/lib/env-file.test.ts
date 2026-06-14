import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnvFile } from './env-file';

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
});
