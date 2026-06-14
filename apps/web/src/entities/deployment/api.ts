import type { DeploymentDetail, DeploymentSummary } from '@arcturus/shared';
import { ApiError, apiFetch } from '../../shared/api/http';

/**
 * Uploads a project archive via XHR so upload progress can be tracked.
 * `onProgress` is called with a 0–1 fraction as bytes are sent.
 */
export function createDeployment(
  appName: string,
  archive: File,
  description?: string,
  onProgress?: (fraction: number) => void,
  owner?: string,
): Promise<DeploymentSummary> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('appName', appName);
    // Target a shared app under another owner (manage+); omit for your own account.
    if (owner) form.append('owner', owner);
    if (description?.trim()) form.append('description', description.trim());
    form.append('archive', archive);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/deployments');

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as DeploymentSummary);
      } else {
        const body = (() => {
          try {
            return JSON.parse(xhr.responseText) as { message?: string };
          } catch {
            return {};
          }
        })();
        reject(new ApiError(xhr.status, body.message ?? xhr.statusText));
      }
    };

    xhr.onerror = () => reject(new ApiError(0, 'Network error'));
    xhr.send(form);
  });
}

export function getDeployment(id: string): Promise<DeploymentDetail> {
  return apiFetch(`/api/deployments/${id}`);
}

/**
 * Follows a deployment's build log over SSE. Returns a disposer.
 * `onDone` fires with the terminal status once the build finishes.
 */
export function followBuildLog(
  id: string,
  onLine: (line: string) => void,
  onDone: (status: string) => void,
): () => void {
  const source = new EventSource(`/api/deployments/${id}/build-log`);
  source.onmessage = (event) => onLine(JSON.parse(event.data) as string);
  source.addEventListener('done', (event) => {
    onDone(JSON.parse((event as MessageEvent).data) as string);
    source.close();
  });
  source.onerror = () => source.close();
  return () => source.close();
}

/**
 * Follows live container logs over SSE. Returns a disposer.
 * `onEnd` fires when the server ends the stream because the container stopped.
 */
export function followAppLogs(
  appId: string,
  onLine: (line: string) => void,
  onEnd?: () => void,
): () => void {
  const source = new EventSource(`/api/apps/${appId}/logs`);
  source.onmessage = (event) => onLine(JSON.parse(event.data) as string);
  source.addEventListener('end', () => {
    source.close();
    onEnd?.();
  });
  return () => source.close();
}
