'use client';

import type { AppSummary } from '@arcturus/shared';
import { useRef } from 'react';
import { useI18n } from '../../shared/i18n/locale-context';
import { Button } from '../../shared/ui';
import { useToast } from '../../shared/ui/toast';
import { DeployStatusBar } from './deploy-status-bar';
import { useUploadDeploy } from './use-upload-deploy';

/**
 * One-click new release from the app's own page: pick a file, it deploys to
 * this app immediately — no name/description to retype. Static apps also
 * accept a single .html (the server makes it the index).
 */
export function RedeployButton({ app, onDeployed }: { app: AppSummary; onDeployed: () => void }) {
  const { t } = useI18n();
  const { notify } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, uploadPct, logLines, finalStatus, deploy } = useUploadDeploy();

  function handleFile(file: File) {
    // Pass the app's owner so a shared app (manage) redeploys in place instead of
    // forking a same-named app under the current account.
    deploy(app.name, file, undefined, onDeployed, (msg) => notify('error', msg), app.ownerUsername);
  }

  const showBar = busy || finalStatus !== null;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={app.type === 'static' ? '.zip,.html,.htm' : '.zip'}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Allow re-selecting the same file next time.
          event.target.value = '';
          if (file) handleFile(file);
        }}
      />
      <Button type="button" busy={busy} onClick={() => inputRef.current?.click()}>
        {busy ? t.deploy.deploying : t.appDetail.redeploy}
      </Button>

      {showBar && (
        <DeployStatusBar uploadPct={uploadPct} logLines={logLines} finalStatus={finalStatus} />
      )}
    </>
  );
}
