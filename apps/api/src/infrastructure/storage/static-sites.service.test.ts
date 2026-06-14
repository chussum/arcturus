import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppConfig } from '../../common/config/app-config';
import { StaticSitesService } from './static-sites.service';

describe('StaticSitesService', () => {
  let dataDir: string;
  let service: StaticSitesService;

  beforeAll(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcturus-test-'));
    process.env.ARCTURUS_DATA_DIR = dataDir;
    service = new StaticSitesService(new AppConfig());

    const source = path.join(dataDir, 'source');
    fs.mkdirSync(path.join(source, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(source, 'index.html'), '<h1>v1</h1>');
    fs.writeFileSync(path.join(source, 'sub', 'index.html'), '<h1>sub</h1>');
    service.publish('alice', 'blog', 'dep-1', source);
  });

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.ARCTURUS_DATA_DIR;
  });

  test('serves the active release index for the root path', () => {
    const result = service.resolveFile('alice', 'blog', '/', 'dep-1');
    expect(result.kind).toBe('file');
  });

  test('asks for a trailing-slash redirect on bare directory paths', () => {
    expect(service.resolveFile('alice', 'blog', '', 'dep-1').kind).toBe('redirect-add-slash');
    expect(service.resolveFile('alice', 'blog', '/sub', 'dep-1').kind).toBe('redirect-add-slash');
    expect(service.resolveFile('alice', 'blog', '/sub/', 'dep-1').kind).toBe('file');
  });

  test('refuses path traversal out of the release root', () => {
    expect(service.resolveFile('alice', 'blog', '/../../etc/passwd', 'dep-1').kind).toBe(
      'not-found',
    );
    expect(service.resolveFile('alice', 'blog', '/..%2f..', 'dep-1').kind).toBe('not-found');
  });

  test('returns not-found for missing apps, files and unknown releases', () => {
    expect(service.resolveFile('alice', 'nope', '/', 'dep-1').kind).toBe('not-found');
    expect(service.resolveFile('alice', 'blog', '/ghost.html', 'dep-1').kind).toBe('not-found');
    expect(service.resolveFile('alice', 'blog', '/', null).kind).toBe('not-found');
  });

  test('keeps releases side by side and switches by active id (rollback)', () => {
    const next = path.join(dataDir, 'next');
    fs.mkdirSync(next, { recursive: true });
    fs.writeFileSync(path.join(next, 'index.html'), '<h1>v2</h1>');
    service.publish('alice', 'blog', 'dep-2', next);

    const v2 = service.resolveFile('alice', 'blog', '/', 'dep-2');
    expect(v2.kind).toBe('file');
    if (v2.kind === 'file') expect(fs.readFileSync(v2.filePath, 'utf8')).toContain('v2');

    // rollback = serve with the previous id again
    const v1 = service.resolveFile('alice', 'blog', '/', 'dep-1');
    expect(v1.kind).toBe('file');
    if (v1.kind === 'file') expect(fs.readFileSync(v1.filePath, 'utf8')).toContain('v1');

    expect(service.hasRelease('alice', 'blog', 'dep-1')).toBe(true);
    expect(service.hasRelease('alice', 'blog', 'dep-2')).toBe(true);
  });

  test('pruneReleases removes everything outside the keep list', () => {
    service.pruneReleases('alice', 'blog', ['dep-2']);
    expect(service.hasRelease('alice', 'blog', 'dep-1')).toBe(false);
    expect(service.hasRelease('alice', 'blog', 'dep-2')).toBe(true);
  });
});
