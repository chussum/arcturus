import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../common/config/app-config';

export type StaticResolution =
  | { kind: 'file'; filePath: string }
  | { kind: 'redirect-add-slash' }
  | { kind: 'not-found' };

/**
 * Static site storage, versioned per deployment:
 *
 *   data/sites/{user}/{app}/releases/{deploymentId}/
 *
 * The app row's activeDeploymentId decides which release is served, so a
 * rollback is just repointing that id. Old releases rotate out beyond the
 * configured retention. Sites published before versioning existed live
 * directly under the app dir and are served as a legacy fallback.
 */
@Injectable()
export class StaticSitesService {
  constructor(private readonly config: AppConfig) {}

  /** Copies the new release into place. Serving switches when the caller updates activeDeploymentId. */
  publish(username: string, appName: string, deploymentId: string, sourceDir: string): void {
    const releaseDir = this.releaseDir(username, appName, deploymentId);
    fs.mkdirSync(path.dirname(releaseDir), { recursive: true });
    fs.cpSync(sourceDir, releaseDir, { recursive: true });
  }

  /** Deletes releases beyond the retention limit, never touching the ones in `keep`. */
  pruneReleases(username: string, appName: string, keep: string[]): void {
    const releasesRoot = path.join(this.appDir(username, appName), 'releases');
    if (!fs.existsSync(releasesRoot)) return;

    const keepSet = new Set(keep);
    for (const entry of fs.readdirSync(releasesRoot)) {
      if (!keepSet.has(entry)) {
        fs.rmSync(path.join(releasesRoot, entry), { recursive: true, force: true });
      }
    }
  }

  hasRelease(username: string, appName: string, deploymentId: string): boolean {
    return fs.existsSync(this.releaseDir(username, appName, deploymentId));
  }

  remove(username: string, appName: string): void {
    fs.rmSync(this.appDir(username, appName), { recursive: true, force: true });
  }

  /** Removes a user's entire static tree (all apps + the now-empty parent dir).
   *  Used on account deletion so no orphan `sites/{user}/` directory is left. */
  removeUser(username: string): void {
    fs.rmSync(path.join(this.config.sitesDir, username), { recursive: true, force: true });
  }

  /**
   * Maps a request path to a file inside the active release, refusing
   * anything that resolves outside it (path traversal).
   *
   * Directory hits without a trailing slash ask for a redirect first, so the
   * browser resolves the page's relative asset URLs against the right base.
   */
  resolveFile(
    username: string,
    appName: string,
    requestPath: string,
    activeDeploymentId: string | null,
  ): StaticResolution {
    const root = this.servingRoot(username, appName, activeDeploymentId);
    if (!root) return { kind: 'not-found' };

    const resolved = path.resolve(root, `.${path.posix.normalize(`/${requestPath}`)}`);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return { kind: 'not-found' };

    if (!fs.existsSync(resolved)) return { kind: 'not-found' };
    if (fs.statSync(resolved).isDirectory()) {
      if (!requestPath.endsWith('/')) return { kind: 'redirect-add-slash' };
      const index = path.join(resolved, 'index.html');
      return fs.existsSync(index) ? { kind: 'file', filePath: index } : { kind: 'not-found' };
    }
    return { kind: 'file', filePath: resolved };
  }

  /** Active release dir; pre-versioning sites fall back to the legacy flat layout. */
  private servingRoot(
    username: string,
    appName: string,
    activeDeploymentId: string | null,
  ): string | null {
    if (activeDeploymentId) {
      const release = this.releaseDir(username, appName, activeDeploymentId);
      if (fs.existsSync(release)) return release;
    }
    const legacy = this.appDir(username, appName);
    // The legacy layout has site files directly in the app dir (no releases/).
    if (fs.existsSync(path.join(legacy, 'index.html'))) return legacy;
    return null;
  }

  private releaseDir(username: string, appName: string, deploymentId: string): string {
    return path.join(this.appDir(username, appName), 'releases', deploymentId);
  }

  private appDir(username: string, appName: string): string {
    return path.join(this.config.sitesDir, username, appName);
  }
}
