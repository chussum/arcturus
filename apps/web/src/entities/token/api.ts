import type { CreateTokenResponse, TokenSummary } from '@arcturus/shared';
import { apiFetch, postJson } from '../../shared/api/http';

export function createToken(
  name: string,
  expiresInDays: number | null,
): Promise<CreateTokenResponse> {
  return postJson('/api/tokens', { name, expiresInDays });
}

export function listTokens(): Promise<TokenSummary[]> {
  return apiFetch('/api/tokens');
}

export function revokeToken(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/tokens/${id}`, { method: 'DELETE' });
}
