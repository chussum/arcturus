import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppConfig } from '../../common/config/app-config';
import { EnvCryptoService } from './env-crypto.service';

describe('EnvCryptoService', () => {
  let dataDir: string;
  let service: EnvCryptoService;

  beforeAll(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcturus-test-'));
    process.env.ARCTURUS_DATA_DIR = dataDir;
    delete process.env.ARCTURUS_ENV_KEY;
    service = new EnvCryptoService(new AppConfig());
  });

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.ARCTURUS_DATA_DIR;
    delete process.env.ARCTURUS_ENV_KEY;
  });

  test('roundtrips and never stores the plaintext', () => {
    const plaintext = JSON.stringify({ API_SECRET: 'hunter2' });
    const stored = service.encrypt(plaintext);

    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(stored).not.toContain('hunter2');
    expect(service.isEncrypted(stored)).toBe(true);
    expect(service.decrypt(stored)).toBe(plaintext);
  });

  test('uses a fresh IV per encryption', () => {
    expect(service.encrypt('{}')).not.toBe(service.encrypt('{}'));
  });

  test('passes legacy plaintext rows through unchanged', () => {
    const legacy = '{"FOO":"bar"}';
    expect(service.isEncrypted(legacy)).toBe(false);
    expect(service.decrypt(legacy)).toBe(legacy);
  });

  test('rejects tampered ciphertext', () => {
    const stored = service.encrypt('{"FOO":"bar"}');
    const [enc, v1, ivB64, payloadB64] = stored.split(':');
    const payload = Buffer.from(payloadB64 ?? '', 'base64');
    payload[0] = (payload[0] ?? 0) ^ 0xff;
    const tampered = `${enc}:${v1}:${ivB64}:${payload.toString('base64')}`;
    expect(() => service.decrypt(tampered)).toThrow('env decryption failed');
  });

  test('rejects values encrypted under a different key', () => {
    process.env.ARCTURUS_ENV_KEY = 'a-completely-different-key';
    const other = new EnvCryptoService(new AppConfig());
    delete process.env.ARCTURUS_ENV_KEY;

    expect(() => other.decrypt(service.encrypt('{}'))).toThrow('env decryption failed');
  });

  test('generates an owner-only key file and stays stable across restarts', () => {
    const keyFile = path.join(dataDir, 'env-key');
    expect(fs.existsSync(keyFile)).toBe(true);
    expect(fs.statSync(keyFile).mode & 0o777).toBe(0o600);

    const restarted = new EnvCryptoService(new AppConfig());
    expect(restarted.decrypt(service.encrypt('{"FOO":"bar"}'))).toBe('{"FOO":"bar"}');
  });

  test('prefers ARCTURUS_ENV_KEY over the key file', () => {
    process.env.ARCTURUS_ENV_KEY = 'explicit-key';
    const a = new EnvCryptoService(new AppConfig());
    const b = new EnvCryptoService(new AppConfig());
    delete process.env.ARCTURUS_ENV_KEY;

    expect(b.decrypt(a.encrypt('{}'))).toBe('{}');
    expect(() => service.decrypt(a.encrypt('{}'))).toThrow('env decryption failed');
  });
});
