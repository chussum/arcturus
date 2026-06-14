import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { AppConfig } from '../../common/config/app-config';

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * At-rest encryption for the apps.env column (AES-256-GCM).
 *
 * Stored format: `enc:v1:<base64 iv>:<base64 ciphertext||authTag>`.
 * Values without the prefix are legacy plaintext and pass through decrypt()
 * unchanged; EnvEncryptionMigrator re-encrypts them at boot.
 */
@Injectable()
export class EnvCryptoService {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.key = resolveKey(config);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const payload = Buffer.concat([ciphertext, cipher.getAuthTag()]);
    return `${PREFIX}${iv.toString('base64')}:${payload.toString('base64')}`;
  }

  decrypt(stored: string): string {
    if (!this.isEncrypted(stored)) return stored;

    const [ivB64, payloadB64] = stored.slice(PREFIX.length).split(':');
    const iv = Buffer.from(ivB64 ?? '', 'base64');
    const payload = Buffer.from(payloadB64 ?? '', 'base64');
    const tag = payload.subarray(payload.length - TAG_BYTES);
    const ciphertext = payload.subarray(0, payload.length - TAG_BYTES);

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // A silent fallback here would deploy containers without their secrets.
      throw new Error('env decryption failed: ARCTURUS_ENV_KEY mismatch or corrupted data');
    }
  }

  isEncrypted(stored: string): boolean {
    return stored.startsWith(PREFIX);
  }
}

/** String key material normalized to the 32 bytes AES-256 requires. */
function resolveKey(config: AppConfig): Buffer {
  return createHash('sha256').update(resolveKeyMaterial(config)).digest();
}

/**
 * Use the configured key when provided; otherwise generate one once and keep
 * it on disk so existing rows stay decryptable across restarts.
 */
function resolveKeyMaterial(config: AppConfig): string {
  if (config.envKey) return config.envKey;

  if (config.isProduction) {
    throw new Error(
      'ARCTURUS_ENV_KEY must be set in production. Refusing to fall back to the plaintext ' +
        'data/env-key file — a leaked file would decrypt every stored app env var. Run `bun run secrets:init`.',
    );
  }

  new Logger(EnvCryptoService.name).warn(
    'ARCTURUS_ENV_KEY is not set — falling back to the PLAINTEXT key file data/env-key. ' +
      'Run `bun run secrets:init` (macOS) to move it into an encrypted .env.secrets + Keychain.',
  );
  const keyFile = path.join(config.dataDir, 'env-key');
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile, 'utf8').trim();
  }
  const generated = nanoid(64);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(keyFile, generated, { mode: 0o600 });
  return generated;
}
