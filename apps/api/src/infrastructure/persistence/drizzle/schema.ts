import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('users_username_unique').on(table.username)],
);

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  memo: text('memo'),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * One row per live dashboard session (the JWT carries the row id as `jti`).
 * Deleting the row revokes the session immediately — without this, a logout
 * would only clear the cookie while the token stays valid until expiry.
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** SHA-256 of the token — the plaintext is shown once and never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull(),
  lastUsedAt: text('last_used_at'),
  /** When the token expires; null means it never expires. */
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
});

export const apps = sqliteTable(
  'apps',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Optional human description shown under the app name. */
    description: text('description'),
    type: text('type', { enum: ['static', 'container'] }).notNull(),
    status: text('status', { enum: ['idle', 'running', 'stopped', 'failed'] }).notNull(),
    routeMode: text('route_mode', { enum: ['proxy', 'redirect'] })
      .notNull()
      .default('proxy'),
    /** Fixed host port for container apps; stable across redeploys. */
    assignedPort: integer('assigned_port').unique(),
    containerId: text('container_id'),
    /** Deployment currently being served; rollback just repoints this. */
    activeDeploymentId: text('active_deployment_id'),
    /** User-defined environment variables for container apps, as a JSON object. */
    env: text('env').notNull().default('{}'),
    /** Per-app container memory cap in MB; null means use the server default. */
    memoryLimitMb: integer('memory_limit_mb'),
    createdAt: text('created_at').notNull(),
    lastDeployedAt: text('last_deployed_at'),
    /** null = not shared with everyone; 'view'/'manage' = shared with all users at that role */
    sharedAllRole: text('shared_all_role', { enum: ['view', 'manage'] }),
  },
  (table) => [uniqueIndex('apps_owner_name_unique').on(table.userId, table.name)],
);

export const appShares = sqliteTable(
  'app_shares',
  {
    id: text('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['view', 'manage'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('app_shares_app_user_unique').on(table.appId, table.userId)],
);

export const deployments = sqliteTable('deployments', {
  id: text('id').primaryKey(),
  appId: text('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['queued', 'building', 'running', 'failed'] }).notNull(),
  buildLog: text('build_log').notNull().default(''),
  finishedAt: text('finished_at'),
  createdAt: text('created_at').notNull(),
});

export const passwordResets = sqliteTable('password_resets', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** SHA-256 of the plaintext token — the plaintext is shown once and never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  /** Set when consumed; null means the token is still valid. */
  usedAt: text('used_at'),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type AppRow = typeof apps.$inferSelect;
export type AppShareRow = typeof appShares.$inferSelect;
export type DeploymentRow = typeof deployments.$inferSelect;
export type PasswordResetRow = typeof passwordResets.$inferSelect;
