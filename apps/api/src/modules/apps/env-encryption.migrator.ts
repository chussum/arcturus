import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { EnvCryptoService } from '../../infrastructure/crypto/env-crypto.service';
import { AppsRepository } from '../../infrastructure/persistence/repositories/apps.repository.port';
import { parseEnvColumn } from './container-env';

/**
 * One-time boot migration: rows written before env encryption existed hold
 * plaintext JSON; re-encrypt them in place. Idempotent via the enc:v1: prefix.
 */
@Injectable()
export class EnvEncryptionMigrator implements OnApplicationBootstrap {
  private readonly logger = new Logger(EnvEncryptionMigrator.name);

  constructor(
    private readonly apps: AppsRepository,
    private readonly envCrypto: EnvCryptoService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const rows = await this.apps.list();
    let migrated = 0;
    for (const row of rows) {
      if (this.envCrypto.isEncrypted(row.env)) continue;
      // parseEnvColumn normalizes legacy/corrupt plaintext before encrypting.
      const env = parseEnvColumn(row.env);
      await this.apps.update(row.id, { env: this.envCrypto.encrypt(JSON.stringify(env)) });
      migrated += 1;
    }
    if (migrated > 0) this.logger.log(`Encrypted env vars for ${migrated} app(s)`);
  }
}
