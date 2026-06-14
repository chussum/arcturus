import type { InviteSummary } from '@arcturus/shared';
import { apiFetch, postJson } from '../../shared/api/http';

export function createInvite(memo?: string): Promise<InviteSummary> {
  return postJson('/api/invites', { memo });
}

export function listInvites(): Promise<InviteSummary[]> {
  return apiFetch('/api/invites');
}

export function deleteInvite(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/invites/${id}`, { method: 'DELETE' });
}
