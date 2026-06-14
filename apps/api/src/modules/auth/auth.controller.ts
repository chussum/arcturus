import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
  ResetTokenInfo,
  SignupRequest,
} from '@arcturus/shared';
import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { PasswordResetService } from './password-reset.service';
import { SessionService } from './session.service';

const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async login(
    @Body() body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const user = await this.auth.login(body.username ?? '', body.password ?? '');
    await this.attachSession(req, res, user);
    return { user: this.auth.toProfile(user) };
  }

  @Post('signup')
  @UseGuards(ThrottlerGuard)
  async signup(
    @Body() body: SignupRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const user = await this.auth.signupWithInvite(
      body.inviteCode ?? '',
      body.username ?? '',
      body.password ?? '',
    );
    await this.attachSession(req, res, user);
    return { user: this.auth.toProfile(user) };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    // Revoke server-side too — clearing the cookie alone would leave the JWT
    // usable until its natural expiry if it had leaked.
    const token = req.cookies?.[SessionService.cookieName];
    if (typeof token === 'string' && token !== '') {
      await this.sessions.revoke(token);
    }
    res.clearCookie(SessionService.cookieName);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: UserRow): AuthResponse {
    return { user: this.auth.toProfile(user) };
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AuthGuard, ThrottlerGuard)
  async changePassword(
    @Body() body: ChangePasswordRequest,
    @CurrentUser() user: UserRow,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(user, body.currentPassword ?? '', body.newPassword ?? '');
    // All sessions were revoked; re-issue a fresh cookie for this device.
    await this.attachSession(req, res, user);
    return { ok: true };
  }

  @Get('reset/:token')
  async resetInfo(@Param('token') token: string): Promise<ResetTokenInfo> {
    return this.passwordReset.info(token);
  }

  @Post('reset')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async resetPassword(@Body() body: ResetPasswordRequest): Promise<{ ok: true }> {
    await this.passwordReset.consume(body.token ?? '', body.newPassword ?? '');
    return { ok: true };
  }

  private async attachSession(req: Request, res: Response, user: UserRow): Promise<void> {
    const token = await this.sessions.issue({ userId: user.id });
    res.cookie(SessionService.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      // Set Secure only when the request arrived over HTTPS, so plain-HTTP LAN
      // deployments still work while TLS deployments get cookie protection.
      secure: req.secure,
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
    });
  }
}
