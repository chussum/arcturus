export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface CreateResetLinkResponse {
  token: string;
  expiresAt: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

/** Returned by the public GET reset/:token endpoint to show who the reset is for. */
export interface ResetTokenInfo {
  username: string;
}
