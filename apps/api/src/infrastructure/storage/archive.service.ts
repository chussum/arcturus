import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { LocalizedBadRequest } from '../../common/i18n/localized.exception';

/** Decompression-bomb guards: a small upload must not expand without bound. */
const MAX_ENTRIES = 10_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

@Injectable()
export class ArchiveService {
  /** Overridable so tests can exercise the guards without GiB-scale fixtures. */
  protected readonly maxEntries: number = MAX_ENTRIES;
  protected readonly maxTotalUncompressedBytes: number = MAX_TOTAL_UNCOMPRESSED_BYTES;

  /**
   * Extracts a zip into `destination`, rejecting entries that would escape it
   * (zip-slip) and absolute paths. Returns the directory that holds the
   * project root: when the archive wraps everything in a single top-level
   * folder (the common "zip of a folder" case), that folder is returned.
   */
  extract(zipFile: string, destination: string): string {
    try {
      this.extractChecked(zipFile, destination);
    } catch (error) {
      // Never leave a half-written extraction behind for the pipeline to find.
      fs.rmSync(destination, { recursive: true, force: true });
      throw error;
    }
    return this.findProjectRoot(destination);
  }

  private extractChecked(zipFile: string, destination: string): void {
    const zip = new AdmZip(zipFile);

    const entries = zip.getEntries();
    if (entries.length > this.maxEntries) {
      throw new LocalizedBadRequest('archive.tooManyEntries', { limit: this.maxEntries });
    }

    const root = path.resolve(destination);

    // First pass: shape checks plus a cheap bomb pre-filter on the declared
    // sizes, so an honestly-labelled bomb is rejected before any inflation.
    let declaredTotal = 0;
    for (const entry of entries) {
      const resolved = path.resolve(root, entry.entryName);
      if (!resolved.startsWith(root + path.sep)) {
        throw new LocalizedBadRequest('archive.entryEscapes', { name: entry.entryName });
      }
      // A symlink could point outside the release dir and get served as a file.
      if (isSymlinkEntry(entry.attr)) {
        throw new LocalizedBadRequest('archive.symlinkEntry', { name: entry.entryName });
      }
      declaredTotal += entry.header.size;
      if (declaredTotal > this.maxTotalUncompressedBytes) {
        throw new LocalizedBadRequest('archive.uncompressedLimit', {
          gib: this.maxTotalUncompressedBytes / (1024 * 1024 * 1024),
        });
      }
    }

    // Second pass: extract entry by entry, enforcing the cap on the bytes that
    // actually inflate. adm-zip bounds each entry's output at its declared size
    // (it inflates into Buffer.alloc(header.size)), so today this guard is
    // defense-in-depth against that library behavior ever changing.
    fs.mkdirSync(root, { recursive: true });
    let actualTotal = 0;
    for (const entry of entries) {
      const resolved = path.resolve(root, entry.entryName);
      if (entry.isDirectory) {
        fs.mkdirSync(resolved, { recursive: true });
        continue;
      }
      const data = entry.getData();
      actualTotal += data.length;
      if (actualTotal > this.maxTotalUncompressedBytes) {
        throw new LocalizedBadRequest('archive.uncompressedLimit', {
          gib: this.maxTotalUncompressedBytes / (1024 * 1024 * 1024),
        });
      }
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, data);
    }
  }

  private findProjectRoot(extractedDir: string): string {
    const entries = fs
      .readdirSync(extractedDir)
      .filter((name) => name !== '__MACOSX' && !name.startsWith('.'));

    const single = entries.length === 1 ? path.join(extractedDir, entries[0] ?? '') : null;
    if (single && fs.statSync(single).isDirectory()) return single;
    return extractedDir;
  }
}

/** The unix file mode lives in the high 16 bits of a zip entry's attributes. */
function isSymlinkEntry(attr: number): boolean {
  return ((attr >>> 16) & 0o170000) === 0o120000;
}
