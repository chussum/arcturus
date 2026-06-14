import type { UserRole } from '@arcturus/shared';
import type { UserRow } from '../drizzle/schema';

export interface CreateUserData {
  username: string;
  passwordHash: string;
  role: UserRole;
}

/**
 * Persistence boundary for accounts. Abstract class so it doubles as a
 * Nest injection token — swap the implementation without touching domains.
 */
export abstract class UsersRepository {
  abstract findById(id: string): Promise<UserRow | null>;
  abstract findByUsername(username: string): Promise<UserRow | null>;
  abstract list(): Promise<UserRow[]>;
  abstract create(data: CreateUserData): Promise<UserRow>;
  abstract delete(id: string): Promise<void>;
  abstract countAdmins(): Promise<number>;
  abstract updatePassword(id: string, passwordHash: string): Promise<void>;
}
