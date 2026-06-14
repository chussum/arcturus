export interface CreateTokenRequest {
  /** Human label, e.g. "work laptop CLI". */
  name: string;
  /** Days until the token expires; null or omitted means it never expires. */
  expiresInDays?: number | null;
}

/** Returned exactly once at creation time — the plaintext token is never stored. */
export interface CreateTokenResponse {
  id: string;
  name: string;
  token: string;
  /** ISO timestamp when the token expires; null means it never expires. */
  expiresAt: string | null;
}

export interface TokenSummary {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
  /** ISO timestamp when the token expires; null means it never expires. */
  expiresAt: string | null;
}
