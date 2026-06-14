import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/infrastructure/persistence/drizzle/schema.ts',
  out: './src/infrastructure/persistence/drizzle/migrations',
  dbCredentials: {
    url: process.env.ARCTURUS_DATA_DIR
      ? `${process.env.ARCTURUS_DATA_DIR}/arcturus.db`
      : '../../data/arcturus.db',
  },
});
