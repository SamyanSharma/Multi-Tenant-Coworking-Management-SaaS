// Must be the first import.
// Loads variables from apps/backend/.env before NestJS/Prisma services
// are initialized.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  /*
   * rawBody: true preserves req.rawBody on every request.
   *
   * Stripe signs the exact raw request bytes, so the webhook controller
   * needs the raw body to verify Stripe's signature correctly.
   */
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  /*
   * Use FRONTEND_URL in deployment, while keeping localhost:3001
   * as the local-development default.
   */
  app.enableCors({
    origin:
      process.env.FRONTEND_URL ?? 'http://localhost:3001',
  });

  /*
   * whitelist:
   * Removes properties that aren't declared by the DTO.
   *
   * forbidNonWhitelisted:
   * Rejects requests containing unexpected properties instead of
   * silently removing them.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(
    process.env.PORT ?? 3000,
  );
}

bootstrap();