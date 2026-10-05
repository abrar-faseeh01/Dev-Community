import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  ApiGetMe,
  ApiLogin,
  ApiLogout,
  ApiRefresh,
  ApiSignup,
  ApiUpdateMe,
} from './auth.swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateCredentialsDto } from './dto/update-credentials.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // One options object per cookie, used for setting AND clearing it: a browser
  // only drops a cookie when the clear names the same path, so the two can never
  // be allowed to drift apart. maxAge is not part of it (clearCookie ignores it).
  //
  // The refresh cookie is scoped to COOKIE_REFRESH_PATH, so the browser sends it
  // only to the auth routes and never with an ordinary API call.
  private cookieOptions(name: 'access_token' | 'refresh_token'): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      path:
        name === 'refresh_token'
          ? this.config.getOrThrow<string>('COOKIE_REFRESH_PATH')
          : '/',
    };
  }

  // The access cookie lives as long as the refresh token has left, not as long
  // as the 15-minute JWT inside it. The JWT expiring is what makes the API 401
  // and the frontend refresh; the cookie surviving is what keeps the Next
  // middleware (which only checks that the cookie exists) from sending the user
  // to /login before that refresh can happen.
  private setAccessCookie(
    res: Response,
    token: string,
    refreshExpiresAt: number,
  ) {
    res.cookie('access_token', token, {
      ...this.cookieOptions('access_token'),
      maxAge: Math.max(0, refreshExpiresAt - Date.now()),
    });
  }

  private setSessionCookies(
    res: Response,
    session: {
      accessToken: string;
      refreshToken: string;
      refreshExpiresAt: number;
    },
  ) {
    this.setAccessCookie(res, session.accessToken, session.refreshExpiresAt);
    res.cookie('refresh_token', session.refreshToken, {
      ...this.cookieOptions('refresh_token'),
      maxAge: Math.max(0, session.refreshExpiresAt - Date.now()),
    });
  }

  private clearSessionCookies(res: Response) {
    res.clearCookie('access_token', this.cookieOptions('access_token'));
    res.clearCookie('refresh_token', this.cookieOptions('refresh_token'));
  }

  @Public()
  @Post('signup')
  @HttpCode(201)
  // Prevents rapid spam-account creation.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiSignup()
  async signup(@Body() dto: SignupDto) {
    const user = await this.authService.signup(dto);
    return {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  // Classic password-guessing target — the tightest limit in the app.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiLogin()
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, ...session } = await this.authService.login(dto);
    this.setSessionCookies(res, session);

    return {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }

  // Public: the access token is expired by definition when this is called, so
  // JwtAuthGuard cannot be what authenticates it; the refresh cookie is, checked
  // in AuthService.refresh. Any 401 clears both cookies so the client is not
  // left holding a dead session; a server error does not, since the session may
  // still be good.
  @Public()
  @Post('refresh')
  @HttpCode(200)
  // Every signed-out page load fires one (GET /auth/me 401s, the frontend
  // tries a refresh), so this is looser than login but still bounded.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiRefresh()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { accessToken, refreshExpiresAt, user } =
        await this.authService.refresh(req.cookies?.['refresh_token']);
      // The refresh cookie is left alone: the token is not rotated.
      this.setAccessCookie(res, accessToken, refreshExpiresAt);
      return {
        id: String(user._id),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) this.clearSessionCookies(res);
      throw err;
    }
  }

  // Public: clearing a cookie must not require a still-valid one — an
  // expired/tampered/missing token would otherwise 401 before this runs
  // and the client could never log itself out. The cookies are cleared first,
  // so they go even if revoking the hash then fails.
  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiLogout()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.clearSessionCookies(res);
    await this.authService.logout(req.cookies?.['refresh_token']);
    return null; // ResponseInterceptor wraps this as { success: true, data: null }
  }

  @Get('me')
  @ApiGetMe()
  me(
    @CurrentUser()
    user: {
      userId: string;
      fullName: string;
      email: string;
      role: string;
    },
  ) {
    return {
      id: user.userId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }

  @Patch('me')
  @HttpCode(200)
  // Also checks currentPassword (a guessing target), but legitimate users
  // may reasonably mistype a few times — more headroom than login/signup.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiUpdateMe()
  async updateMe(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateCredentialsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user: updated, ...session } =
      await this.authService.updateCredentials(user.userId, dto);
    this.setSessionCookies(res, session);

    return {
      id: String(updated._id),
      fullName: updated.fullName,
      email: updated.email,
      role: updated.role,
    };
  }
}
