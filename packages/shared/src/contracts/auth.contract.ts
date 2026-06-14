import type { UserRole } from '../enums/user-role';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface SignupRequest {
  inviteCode: string;
  username: string;
  password: string;
}

/** Public view of an account — never carries credentials. */
export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  user: UserProfile;
}
