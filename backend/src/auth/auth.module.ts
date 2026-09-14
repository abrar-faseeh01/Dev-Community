import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '2h') },
      }),
    }),

    ThrottlerModule.forRoot([
      // Global default: a sanity ceiling against runaway bugs/scripts, not
      // a real constraint on normal authenticated use — the genuinely
      // brute-force-sensitive routes (login/signup/credential changes) get
      // their own much tighter @Throttle() override in auth.controller.ts.
      { ttl: 60000, limit: 100 }, // 100 requests per minute per IP
    ]),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    JwtStrategy,

    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],

  exports: [AuthService],
})
export class AuthModule {}
