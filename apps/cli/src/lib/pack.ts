import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

/** Build artifacts and local state that never belong in a deployment archive. */
const EXCLUDED = new Set(['node_modules', '.git', '.next', 'dist', '.DS_Store', 'arcturus.json']);

/** Every `.env*` file (.env, .env.local, .env.production, …) — secrets never go in the image context. */
const ENV_FILE_PATTERN = /^\.env(\..*)?$/;

/**
 * Zips a project directory into a Buffer, skipping dependency/VCS noise and all
 * `.env*` files. `extraExcludes` drops additional basenames (e.g. an `--env-file`
 * pointing outside the `.env*` pattern) so deploy-supplied secrets stay out of the image.
 */
export function packProject(dir: string, extraExcludes: string[] = []): Buffer {
  const zip = new AdmZip();
  const extra = new Set(extraExcludes);

  const addEntry = (absolute: string, relative: string): void => {
    const name = path.basename(absolute);
    if (EXCLUDED.has(name) || extra.has(name) || ENV_FILE_PATTERN.test(name)) return;

    if (fs.statSync(absolute).isDirectory()) {
      for (const child of fs.readdirSync(absolute)) {
        addEntry(path.join(absolute, child), path.posix.join(relative, child));
      }
    } else {
      zip.addLocalFile(
        absolute,
        path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative),
      );
    }
  };

  for (const child of fs.readdirSync(dir)) {
    addEntry(path.join(dir, child), child);
  }
  return zip.toBuffer();
}
