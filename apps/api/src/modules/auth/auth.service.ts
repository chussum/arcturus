import type { UserProfile } from '@arcturus/shared';
import { UserRole } from '@arcturus/shared';
import { Injectable } from '@nestjs/common';
import {
  LocalizedBadRequest,
  LocalizedConflict,
  LocalizedUnauthorized,
} from '../../common/i18n/localized.exception';
import { RESERVED_USERNAMES } from '../../common/reserved-paths';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { InvitesRepository } from '../../infrastructure/persistence/repositories/invites.repository.port';
import { SessionsRepository } from '../../infrastructure/persistence/repositories/sessions.repository.port';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';
import { PasswordService } from './password.service';

/**
 * Usernames become the first URL segment of every deployed app, so they are
 * restricted to a safe charset and must not shadow platform routes.
 */
const USERNAME_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly invites: InvitesRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwords: PasswordService,
  ) {}

  async login(username: string, password: string): Promise<UserRow> {
    const user = await this.users.findByUsername(username);
    // Verify against a dummy hash on unknown users to keep timing uniform.
    const hash = user?.passwordHash ?? (await this.passwords.hash('invalid'));
    const valid = await this.passwords.verify(password, hash);
    if (!user || !valid) throw new LocalizedUnauthorized('auth.invalidCredentials');
    return user;
  }

  async signupWithInvite(inviteCode: string, username: string, password: string): Promise<UserRow> {
    this.assertValidUsername(username);
    if (password.length < 8) {
      throw new LocalizedBadRequest('auth.passwordTooShort');
    }

    const invite = await this.invites.findByCode(inviteCode);
    if (!invite || invite.usedBy) throw new LocalizedBadRequest('auth.inviteInvalid');
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new LocalizedBadRequest('auth.inviteExpired');
    }

    if (await this.users.findByUsername(username)) {
      throw new LocalizedConflict('auth.usernameTaken', { username });
    }

    const user = await this.users.create({
      username,
      passwordHash: await this.passwords.hash(password),
      role: UserRole.Member,
    });
    // The claim is atomic: a concurrent signup with the same invite loses here
    // and gets unwound, instead of two accounts sharing one invite.
    if (!(await this.invites.markUsed(invite.id, user.id))) {
      await this.users.delete(user.id);
      throw new LocalizedBadRequest('auth.inviteInvalid');
    }
    return user;
  }

  async changePassword(user: UserRow, currentPassword: string, newPassword: string): Promise<void> {
    const valid = await this.passwords.verify(currentPassword, user.passwordHash);
    if (!valid) throw new LocalizedUnauthorized('auth.currentPasswordWrong');
    if (newPassword.length < 8) throw new LocalizedBadRequest('auth.passwordTooShort');
    const hash = await this.passwords.hash(newPassword);
    await this.users.updatePassword(user.id, hash);
    await this.sessions.deleteByUser(user.id);
  }

  toProfile(user: UserRow): UserProfile {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  private assertValidUsername(username: string): void {
    if (!USERNAME_PATTERN.test(username)) {
      throw new LocalizedBadRequest('auth.usernamePattern');
    }
    if (RESERVED_USERNAMES.has(username)) {
      throw new LocalizedBadRequest('auth.usernameReserved', { username });
    }
  }
}
