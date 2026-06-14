import type { AppSummary } from '@arcturus/shared';

/** A deploy target: an app name, optionally namespaced to another account's owner. */
export interface AppRef {
  /** Owner username when the name was given as `owner/app`; undefined means your own account. */
  owner?: string;
  name: string;
}

/**
 * Parses a `--name` value (or arcturus.json name / dir name) into an optional owner prefix
 * and the bare app name. `owner/app` → cross-account; `app` → your own account.
 * Rejects more than one slash so a typo never silently picks a wrong target.
 */
export function parseAppRef(raw: string): AppRef {
  const parts = raw.split('/');
  if (parts.length === 1) return { name: raw };
  if (parts.length === 2) {
    const [owner, name] = parts;
    if (!owner || !name) {
      throw new Error(`Invalid app name "${raw}" — use "app" or "owner/app"`);
    }
    return { owner, name };
  }
  throw new Error(`Invalid app name "${raw}" — at most one "/" (owner/app) is allowed`);
}

/**
 * Among the caller's visible apps, the ones owned by someone else that share this name and
 * that the caller can deploy to (manage grant). Filtering to `viewerRole === 'manage'`
 * deliberately excludes admin-visibility noise: admins see every app as role `admin`, never
 * `manage`, so they get no auto-prompt and simply deploy to their own account.
 */
export function pickCrossAccountCandidates(
  apps: AppSummary[],
  name: string,
  myUsername: string,
): AppSummary[] {
  return apps.filter(
    (a) => a.name === name && a.ownerUsername !== myUsername && a.viewerRole === 'manage',
  );
}
