import type { InviteSummary } from '@arcturus/shared';
import { Injectable } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { LocalizedNotFound } from '../../common/i18n/localized.exception';
import { InvitesRepository } from '../../infrastructure/persistence/repositories/invites.repository.port';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';

/** Unambiguous charset (no 0/O, 1/l/I) — codes get typed or pasted by humans. */
const generateCode = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12);

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitesService {
  constructor(
    private readonly invites: InvitesRepository,
    private readonly users: UsersRepository,
  ) {}

  async create(createdBy: string, memo?: string): Promise<InviteSummary> {
    const row = await this.invites.create({
      code: generateCode(),
      memo: memo?.trim() || null,
      createdBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    });
    return this.toSummary(row, new Map());
  }

  async list(): Promise<InviteSummary[]> {
    const [rows, allUsers] = await Promise.all([this.invites.list(), this.users.list()]);
    const usernameById = new Map(allUsers.map((user) => [user.id, user.username]));
    return rows.map((row) => this.toSummary(row, usernameById));
  }

  async delete(id: string): Promise<void> {
    const rows = await this.invites.list();
    if (!rows.some((row) => row.id === id)) throw new LocalizedNotFound('invites.notFound');
    await this.invites.delete(id);
  }

  private toSummary(
    row: Awaited<ReturnType<InvitesRepository['create']>>,
    usernameById: Map<string, string>,
  ): InviteSummary {
    return {
      id: row.id,
      code: row.code,
      memo: row.memo,
      createdBy: usernameById.get(row.createdBy) ?? row.createdBy,
      usedBy: row.usedBy ? (usernameById.get(row.usedBy) ?? row.usedBy) : null,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }
}
