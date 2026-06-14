'use client';

import { useEffect, useRef, useState } from 'react';
import { createDeployment, followBuildLog } from '../../entities/deployment/api';

export interface UploadDeployHandle {
  busy: boolean;
  /** 0–100 while uploading, null during build log phase or idle. */
  uploadPct: number | null;
  logLines: string[];
  finalStatus: string | null;
  deploy: (
    appName: string,
    file: File,
    description?: string,
    onDone?: () => void,
    onError?: (message: string) => void,
    owner?: string,
  ) => void;
}

/**
 * Manages the full deploy flow for both DeployForm and RedeployButton:
 * XHR upload (with byte-level progress) → SSE build log streaming.
 * Cleans up the SSE connection on unmount.
 */
export function useUploadDeploy(): UploadDeployHandle {
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const disposerRef = useRef<(() => void) | null>(null);

  useEffect(() => () => disposerRef.current?.(), []);

  function deploy(
    appName: string,
    file: File,
    description?: string,
    onDone?: () => void,
    onError?: (message: string) => void,
    owner?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setUploadPct(0);
    setLogLines([]);
    setFinalStatus(null);

    createDeployment(appName, file, description, (f) => setUploadPct(Math.round(f * 100)), owner)
      .then((deployment) => {
        setUploadPct(null);
        disposerRef.current = followBuildLog(
          deployment.id,
          (line) => setLogLines((prev) => [...prev, line]),
          (status) => {
            setFinalStatus(status);
            setBusy(false);
            onDone?.();
          },
        );
      })
      .catch((cause: unknown) => {
        setBusy(false);
        setUploadPct(null);
        onError?.(cause instanceof Error ? cause.message : 'Deployment failed');
      });
  }

  return { busy, uploadPct, logLines, finalStatus, deploy };
}
