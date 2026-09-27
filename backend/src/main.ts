import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS — allow web frontend and Chrome extension
  app.enableCors({
    origin: [
      'http://localhost:3001',
      /^chrome-extension:\/\//,
    ],
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Backend running on http://localhost:${process.env.PORT ?? 3000}/api`);
}
bootstrap();
