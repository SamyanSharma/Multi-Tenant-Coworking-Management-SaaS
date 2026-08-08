import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // whitelist: strips fields not declared on the DTO.
  // forbidNonWhitelisted: rejects the request instead of silently
  // dropping unexpected fields — a stray/malicious extra field in a
  // request body gets caught loudly rather than ignored quietly.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
