import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);

  app.enableCors({
    origin: config.get('FRONTEND_ORIGIN', 'http://localhost:3001'),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Developer Community API')
    .setDescription(
      'API documentation for the Developer Community Platform. Every response follows the shared envelope: {success:true, data} on success or {success:false, statusCode, message, errors} on failure. ' +
        "Auth is an httpOnly `access_token` cookie set by POST /auth/login — there is no bearer header. In Swagger UI, use POST /auth/login's Try it out (with `credentials: 'include'`-equivalent cookie handling) once, then the cookie is sent automatically by the browser on subsequent Try it out calls for protected routes.",
    )
    .setVersion('1.0')
    .addCookieAuth(
      'access_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description: 'httpOnly JWT cookie set by POST /auth/login.',
      },
      // Security scheme name — must match every @ApiCookieAuth('access_token')
      // call site, or Swagger UI's Authorize dialog and each route's security
      // requirement silently point at a scheme that doesn't exist (addCookieAuth
      // defaults this third argument to 'cookie', not the cookie name itself).
      'access_token',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(config.get('PORT', 3000));
}

bootstrap();
