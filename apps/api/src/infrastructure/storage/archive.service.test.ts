import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { ArchiveService } from './archive.service';

describe('ArchiveService', () => {
  let workDir: string;
  const service = new ArchiveService();

  beforeAll(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcturus-test-'));
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function writeZip(name: string, build: (zip: AdmZip) => void): string {
    const zip = new AdmZip();
    build(zip);
    const file = path.join(workDir, name);
    zip.writeZip(file);
    return file;
  }

  test('extracts a regular archive and unwraps a single top-level folder', () => {
    const zipFile = writeZip('ok.zip', (zip) => {
      zip.addFile('site/index.html', Buffer.from('<h1>hi</h1>'));
      zip.addFile('site/sub/a.txt', Buffer.from('a'));
    });

    const root = service.extract(zipFile, path.join(workDir, 'ok-out'));
    expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toContain('hi');
  });

  test('rejects zip-slip entries that escape the extraction root', () => {
    // adm-zip sanitizes addFile() names, so craft the malicious entry directly.
    const zipFile = writeZip('slip.zip', (zip) => {
      zip.addFile('placeholder', Buffer.from('pwned'));
      const entry = zip.getEntries()[0];
      if (entry) entry.entryName = '../evil.txt';
    });

    expect(() => service.extract(zipFile, path.join(workDir, 'slip-out'))).toThrow(
      'escapes extraction root',
    );
    expect(fs.existsSync(path.join(workDir, 'evil.txt'))).toBe(false);
  });

  test('rejects symlink entries', () => {
    const zipFile = writeZip('link.zip', (zip) => {
      zip.addFile('secrets', Buffer.from('/etc/passwd'));
      const entry = zip.getEntries()[0];
      // attr high 16 bits = unix mode; S_IFLNK (0o120000) marks a symlink.
      if (entry) entry.attr = (0o120755 << 16) >>> 0;
    });

    expect(() => service.extract(zipFile, path.join(workDir, 'link-out'))).toThrow('symlink entry');
  });

  /** Tiny caps so bomb behavior is testable without GiB fixtures. */
  class TinyLimitsArchiveService extends ArchiveService {
    protected override readonly maxEntries = 3;
    protected override readonly maxTotalUncompressedBytes = 64;
  }

  test('rejects archives with too many entries', () => {
    const tiny = new TinyLimitsArchiveService();
    const zipFile = writeZip('many.zip', (zip) => {
      for (let i = 0; i < 4; i++) zip.addFile(`f${i}.txt`, Buffer.from('x'));
    });

    expect(() => tiny.extract(zipFile, path.join(workDir, 'many-out'))).toThrow('too many entries');
  });

  test('rejects decompression bombs and leaves no partial extraction behind', () => {
    const tiny = new TinyLimitsArchiveService();
    const zipFile = writeZip('bomb.zip', (zip) => {
      zip.addFile('a.bin', Buffer.alloc(60, 1)); // fits the 64-byte cap alone
      zip.addFile('b.bin', Buffer.alloc(60, 2)); // pushes the total over it
    });

    const out = path.join(workDir, 'bomb-out');
    expect(() => tiny.extract(zipFile, out)).toThrow('uncompressed limit');
    expect(fs.existsSync(out)).toBe(false);
  });
});
