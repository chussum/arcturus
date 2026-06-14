import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { AppConfig } from '../../../common/config/app-config';
import * as schema from './schema';

export type DrizzleDb = ReturnType<typeof createDatabase>;

/** Injection token for the drizzle instance. */
export const DRIZZLE = Symbol('DRIZZLE');

function createDatabase(config: AppConfig) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  // The data dir holds secrets (db env column, key files) — owner-only access.
  fs.chmodSync(config.dataDir, 0o700);
  const sqlite = new Database(config.databaseFile);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${config.databaseFile}${suffix}`;
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  }

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(import.meta.dir, 'migrations') });
  return db;
}

/** Closes SQLite on graceful shutdown so WAL checkpoints back into the db file. */
@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  onApplicationShutdown(): void {
    this.db.$client.close();
  }
}

@Global()
@Module({
  providers: [
    AppConfig,
    {
      provide: DRIZZLE,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createDatabase(config),
    },
    DatabaseLifecycle,
  ],
  exports: [AppConfig, DRIZZLE],
})
export class DatabaseModule {}
