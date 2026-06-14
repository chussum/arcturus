import type { CreateResetLinkResponse, UserProfile } from '@arcturus/shared';
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PasswordResetService } from '../auth/password-reset.service';
import { UsersService } from './users.service';

@Controller('api/users')
@UseGuards(AuthGuard, AdminGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Get()
  list(): Promise<UserProfile[]> {
    return this.usersService.list();
  }

  @Delete(':id')
  async delete(@CurrentUser() user: UserRow, @Param('id') id: string): Promise<{ ok: true }> {
    await this.usersService.delete(id, user.id);
    return { ok: true };
  }

  @Post(':id/reset-link')
  createResetLink(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
  ): Promise<CreateResetLinkResponse> {
    return this.passwordReset.createLink(id, user.id);
  }
}
