import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  // Defaults cover local dev; set CORS_ORIGINS (comma-separated) to lock down
  // production to the real web origin(s). The chrome-extension scheme is allowed
  // so the extension's service worker can call the API cross-origin.
  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: [
      'http://localhost:3001',
      'http://localhost:3000',
      ...configuredOrigins,
      /^chrome-extension:\/\//,
    ],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`Backend running on http://localhost:${port}/api`);
}
bootstrap();
