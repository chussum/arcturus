'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PollState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Fetch-and-optionally-poll hook: tiny stand-in for a data library, enough
 * for a small team dashboard. Pass intervalMs to keep the data live.
 */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs?: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(() => {
    fetcherRef
      .current()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((cause: Error) => setError(cause))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    if (!intervalMs) return;
    const timer = setInterval(load, intervalMs);
    return () => clearInterval(timer);
  }, [load, intervalMs]);

  return { data, error, loading, refresh: load };
}
