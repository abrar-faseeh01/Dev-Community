import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { buildSwaggerConfig } from './swagger-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Before configureApp(): middleware runs in registration order, and the body
  // parsers there can reject a request (413, 415, 400) before any route runs.
  // CORS first means those rejections still carry CORS headers, so the browser
  // shows the real status instead of a generic network error.
  app.enableCors({
    // Validated at boot (an exact origin, defaulted outside production), so
    // there is no second fallback here to drift from the env schema.
    origin: config.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true,
  });

  configureApp(app);

  const swaggerDocument = SwaggerModule.createDocument(
    app,
    buildSwaggerConfig(),
  );
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(config.get('PORT', 3000));
}

bootstrap();
