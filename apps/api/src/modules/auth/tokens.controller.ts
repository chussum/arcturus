import type { CreateTokenRequest, CreateTokenResponse, TokenSummary } from '@arcturus/shared';
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LocalizedBadRequest } from '../../common/i18n/localized.exception';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { ApiTokenService } from './api-token.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('api/tokens')
@UseGuards(AuthGuard)
export class TokensController {
  constructor(private readonly apiTokens: ApiTokenService) {}

  // Throttled: tokens are credentials, so cap how fast they can be minted.
  // (AuthModule already imports ThrottlerModule — providers are module-scoped.)
  @Post()
  @UseGuards(ThrottlerGuard)
  create(
    @CurrentUser() user: UserRow,
    @Body() body: CreateTokenRequest,
  ): Promise<CreateTokenResponse> {
    const name = body.name?.trim();
    if (!name) throw new LocalizedBadRequest('tokens.nameRequired');
    return this.apiTokens.issue(user.id, name, body.expiresInDays);
  }

  @Get()
  list(@CurrentUser() user: UserRow): Promise<TokenSummary[]> {
    return this.apiTokens.listForUser(user.id);
  }

  @Delete(':id')
  async revoke(@CurrentUser() user: UserRow, @Param('id') id: string): Promise<{ ok: true }> {
    await this.apiTokens.revoke(id, user.id);
    return { ok: true };
  }
}
