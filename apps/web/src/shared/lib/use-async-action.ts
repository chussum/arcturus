'use client';

import { useCallback, useRef, useState } from 'react';
import { useToast } from '../ui/toast';

/**
 * Wraps a mutation so the UI always reflects it: `busy` drives button
 * spinners/disabling, re-entry while running is ignored (no double calls),
 * and failures surface as an error toast carrying the server message.
 */
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
  options?: { successMessage?: string },
): { run: (...args: Args) => Promise<boolean>; busy: boolean } {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);

  const run = useCallback(
    async (...args: Args): Promise<boolean> => {
      if (runningRef.current) return false;
      runningRef.current = true;
      setBusy(true);
      try {
        await action(...args);
        if (options?.successMessage) notify('success', options.successMessage);
        return true;
      } catch (cause) {
        notify('error', cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        runningRef.current = false;
        setBusy(false);
      }
    },
    [action, notify, options?.successMessage],
  );

  return { run, busy };
}
