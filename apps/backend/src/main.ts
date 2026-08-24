
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

 
  app.enableCors({
    origin:
      process.env.FRONTEND_URL ?? 'http://localhost:3001',
  });

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