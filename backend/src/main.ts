import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { buildSwaggerConfig } from './swagger-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);

  app.enableCors({
    origin: config.get('FRONTEND_ORIGIN', 'http://localhost:3001'),
    credentials: true,
  });

  const swaggerDocument = SwaggerModule.createDocument(
    app,
    buildSwaggerConfig(),
  );
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(config.get('PORT', 3000));
}

bootstrap();
