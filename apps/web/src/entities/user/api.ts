import type {
  AuthResponse,
  CreateResetLinkResponse,
  ResetTokenInfo,
  UserProfile,
} from '@arcturus/shared';
import { apiFetch, postJson } from '../../shared/api/http';

export function login(username: string, password: string): Promise<AuthResponse> {
  return postJson('/api/auth/login', { username, password });
}

export function signup(
  inviteCode: string,
  username: string,
  password: string,
): Promise<AuthResponse> {
  return postJson('/api/auth/signup', { inviteCode, username, password });
}

export function fetchMe(): Promise<AuthResponse> {
  return apiFetch('/api/auth/me');
}

export function logout(): Promise<{ ok: true }> {
  return apiFetch('/api/auth/logout', { method: 'POST' });
}

export function listUsers(): Promise<UserProfile[]> {
  return apiFetch('/api/users');
}

export function deleteUser(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/users/${id}`, { method: 'DELETE' });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true }> {
  return postJson('/api/auth/change-password', { currentPassword, newPassword });
}

export function createResetLink(userId: string): Promise<CreateResetLinkResponse> {
  return postJson(`/api/users/${userId}/reset-link`, {});
}

export function fetchResetInfo(token: string): Promise<ResetTokenInfo> {
  return apiFetch(`/api/auth/reset/${token}`);
}

export function resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
  return postJson('/api/auth/reset', { token, newPassword });
}
