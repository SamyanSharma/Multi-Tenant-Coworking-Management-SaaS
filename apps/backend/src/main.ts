// Must be the first import: prisma.config.ts loads .env for the Prisma
// CLI (generate/migrate/studio) only — the running NestJS app needs its
// own explicit load, or process.env.DATABASE_URL is undefined at runtime
// (see PROGRESS.md's Stage 1-4 merge gotcha — this bug compiled clean and
// only surfaced on a real DB write).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true preserves req.rawBody on every request (in addition to
  // the normal parsed req.body) — required by
  // payments/webhook.controller.ts, since Stripe signs the exact raw
  // bytes of the request body and verification fails if only the
  // JSON-parsed version is available.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // whitelist: strips fields not declared on the DTO.
  // forbidNonWhitelisted: rejects the request instead of silently
  // dropping unexpected fields — a stray/malicious extra field in a
  // request body gets caught loudly rather than ignored quietly.
  app.enableCors({
  origin: 'http://localhost:3001',
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
