import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

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
  // Standard security headers (nosniff, frameguard, HSTS, removes
  // X-Powered-By, ...). This is a JSON API, so the default CSP is fine.
  // CORP is relaxed to cross-origin because the Next.js frontend and the
  // Socket.IO client call this API from a different origin (CORS still
  // decides who may actually read responses).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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
