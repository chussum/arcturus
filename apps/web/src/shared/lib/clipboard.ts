/**
 * Copy text to the clipboard, working outside secure contexts too.
 *
 * `navigator.clipboard` only exists on HTTPS / localhost; over plain HTTP or a
 * LAN IP it is `undefined`, so a direct `writeText` throws. We try the modern
 * API first and fall back to the legacy `execCommand('copy')` via an off-screen
 * textarea. Returns whether the copy succeeded so callers can toast accordingly.
 *
 * Must run inside a user gesture (click handler) for the legacy path to work.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path (e.g. permission denied / blocked)
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
