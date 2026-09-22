import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

// Everything the app needs on top of AppModule to behave the way production
// does: security headers, the cookie parser the JWT strategy reads from, the
// global validation pipe, and the response envelope (interceptor + filter).
// main.ts and the e2e tests both call this, so a test exercises exactly what
// runs in production instead of a copy that can drift out of sync. CORS and
// Swagger stay in main.ts — they only matter for a real listening server.
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}
