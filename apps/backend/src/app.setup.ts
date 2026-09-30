import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

/**
 * The HTTP configuration shared by the real server (main.ts) and the e2e
 * tests, so the tests exercise exactly the pipes and CORS rules production
 * uses instead of a hand-copied approximation that can drift.
 *
 * NestFactory.create(AppModule, { rawBody: true }) is still passed by the
 * caller: rawBody is a create-time option, not something configurable here,
 * and the Stripe webhook needs it to verify signatures.
 */
export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
