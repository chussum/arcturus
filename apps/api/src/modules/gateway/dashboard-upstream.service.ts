import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../common/config/app-config';

/**
 * Resolves the upstream origin for the Next.js dashboard server.
 *
 * Priority (first non-empty wins):
 *  1. ARCTURUS_DASHBOARD_ORIGIN env — explicit override (dev, verify stacks, manual ops).
 *  2. data/dashboard-upstream state file — written atomically by scripts/web-swap.sh on each
 *     blue-green flip, letting the gateway track the active web port without an API restart.
 *  3. Hard default http://127.0.0.1:3000 — first boot before any swap has run.
 *
 * Cost per request: one fs.statSync(). Content is re-read only when mtime changes,
 * so the hot path stays a single syscall without a file watcher.
 */
@Injectable()
export class DashboardUpstreamService {
  private readonly stateFile: string;
  private cachedOrigin: string | null = null;
  private cachedMtime = 0;

  constructor(config: AppConfig) {
    this.stateFile = path.join(config.dataDir, 'dashboard-upstream');
  }

  currentOrigin(): string {
    // Env override takes priority: dev servers, isolated verify stacks, etc.
    if (process.env.ARCTURUS_DASHBOARD_ORIGIN) {
      return process.env.ARCTURUS_DASHBOARD_ORIGIN;
    }

    try {
      const mtime = fs.statSync(this.stateFile).mtimeMs;
      if (mtime !== this.cachedMtime || this.cachedOrigin === null) {
        const raw = fs.readFileSync(this.stateFile, 'utf8').trim();
        if (raw) {
          this.cachedOrigin = raw;
          this.cachedMtime = mtime;
        }
      }
    } catch {
      // State file absent or unreadable (e.g. between server:down and next swap).
      // Clear the cache so we return the default rather than a stale origin.
      this.cachedOrigin = null;
      this.cachedMtime = 0;
    }

    return this.cachedOrigin ?? 'http://127.0.0.1:3000';
  }
}
