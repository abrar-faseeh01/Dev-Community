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
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import ms from 'ms';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { NullDataResponseDto } from '../common/dto/null-data-response.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
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
  @ApiOperation({
    summary: 'Create an account',
    description: 'Rate-limited to 5 requests/minute per IP.',
  })
  @ApiCreatedResponse({ description: 'Account created.', type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed (weak password, invalid email, etc.).', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'Email already in use.', type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.', type: ErrorResponseDto })
  async signup(@Body() dto: SignupDto) {
    const user = await this.authService.signup(dto);
    return { id: String(user._id), fullName: user.fullName, email: user.email, role: user.role };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  // Classic password-guessing target — the tightest limit in the app.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Log in',
    description:
      'Sets an httpOnly `access_token` cookie on success. Rate-limited to 5 requests/minute per IP.',
  })
  @ApiOkResponse({ description: 'Logged in.', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.', type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.', type: ErrorResponseDto })
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
  @ApiOperation({ summary: 'Log out', description: 'Clears the `access_token` cookie. Never requires a valid session, so a client can always log itself out.' })
  @ApiOkResponse({ description: 'Logged out.', type: NullDataResponseDto })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return null; // ResponseInterceptor wraps this as { success: true, data: null }
  }

  @Get('me')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired session cookie.', type: ErrorResponseDto })
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
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Update your own name, email, and/or password',
    description:
      'Requires `currentPassword` regardless of which field is changing. Only admins may change `newEmail`. Issues a fresh cookie reflecting the new credentials. Rate-limited to 10 requests/minute per IP.',
  })
  @ApiOkResponse({ description: 'Credentials updated.', type: AuthResponseDto })
  @ApiBadRequestResponse({
    description: 'Wrong currentPassword, or no new field provided.',
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({ description: 'A non-admin tried to change newEmail.', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'newEmail already in use, or a concurrent update.', type: ErrorResponseDto })
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
