import type {
  AppSharing,
  AppSummary,
  DeploymentSummary,
  PortCheckResponse,
  RouteMode,
  ShareableUser,
  UpdateAppSharingRequest,
} from '@arcturus/shared';
import { apiFetch, postJson } from '../../shared/api/http';

export function listApps(): Promise<AppSummary[]> {
  return apiFetch('/api/apps');
}

export function getApp(id: string): Promise<AppSummary> {
  return apiFetch(`/api/apps/${id}`);
}

export function stopApp(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}/stop`, { method: 'POST' });
}

export function restartApp(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}/restart`, { method: 'POST' });
}

export function deleteApp(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}`, { method: 'DELETE' });
}

export function listAppDeployments(id: string): Promise<DeploymentSummary[]> {
  return apiFetch(`/api/apps/${id}/deployments`);
}

export function rollbackApp(id: string, deploymentId: string): Promise<{ ok: true }> {
  return postJson(`/api/apps/${id}/rollback`, { deploymentId });
}

export function updateAppDescription(id: string, description: string): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
}

export function updateAppEnv(id: string, env: Record<string, string>): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env }),
  });
}

export function setRouteMode(id: string, routeMode: RouteMode): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routeMode }),
  });
}

export function setMemoryLimit(id: string, memoryLimitMb: number): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memoryLimitMb }),
  });
}

export function checkAppPort(id: string, port: number): Promise<PortCheckResponse> {
  return postJson(`/api/apps/${id}/port/check`, { port });
}

/** port: a specific host port, or null to release the manual port and auto-allocate. */
export function setAppPort(id: string, port: number | null): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}/port`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port }),
  });
}

export function getAppSharing(id: string): Promise<AppSharing> {
  return apiFetch(`/api/apps/${id}/sharing`);
}

export function updateAppSharing(id: string, body: UpdateAppSharingRequest): Promise<{ ok: true }> {
  return apiFetch(`/api/apps/${id}/sharing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function listShareableUsers(): Promise<ShareableUser[]> {
  return apiFetch('/api/apps/shareable-users');
}
