import type { CreateInviteRequest, InviteSummary } from '@arcturus/shared';
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { InvitesService } from './invites.service';

@Controller('api/invites')
@UseGuards(AuthGuard, AdminGuard)
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  create(@CurrentUser() user: UserRow, @Body() body: CreateInviteRequest): Promise<InviteSummary> {
    return this.invites.create(user.id, body.memo);
  }

  @Get()
  list(): Promise<InviteSummary[]> {
    return this.invites.list();
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ ok: true }> {
    await this.invites.delete(id);
    return { ok: true };
  }
}
