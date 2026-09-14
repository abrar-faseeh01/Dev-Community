import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import ms from 'ms';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateCredentialsDto } from './dto/update-credentials.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Derived from JWT_EXPIRES_IN so the cookie can never outlive (or expire
  // before) the token it carries, even if the env var changes.
  private getAccessTokenCookieMaxAge(): number {
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '2h');
    const parsed = ms(expiresIn as ms.StringValue);
    return parsed ?? ms('2h' as ms.StringValue);
  }

  @Public()
  @Post('signup')
  @HttpCode(201)
  // Prevents rapid spam-account creation.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async signup(@Body() dto: SignupDto) {
    const user = await this.authService.signup(dto);
    return { id: String(user._id), fullName: user.fullName, email: user.email, role: user.role };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  // Classic password-guessing target — the tightest limit in the app.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authService.login(dto);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // local http://localhost — production needs secure:true + sameSite:'none' + HTTPS
      maxAge: this.getAccessTokenCookieMaxAge(),
    });

    return {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }

  // Public: clearing a cookie must not require a still-valid one — an
  // expired/tampered/missing token would otherwise 401 before this runs
  // and the client could never log itself out.
  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return null; // ResponseInterceptor wraps this as { success: true, data: null }
  }

  @Get('me')
  me(
    @CurrentUser()
    user: { userId: string; fullName: string; email: string; role: string },
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
  async updateMe(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateCredentialsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user: updated } =
      await this.authService.updateCredentials(user.userId, dto);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: this.getAccessTokenCookieMaxAge(),
    });

    return {
      id: String(updated._id),
      fullName: updated.fullName,
      email: updated.email,
      role: updated.role,
    };
  }
}
