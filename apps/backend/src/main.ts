import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Behind a reverse proxy / PaaS load balancer (Render, Railway, Fly,
  // nginx...) every request appears to come from the proxy's IP, which would
  // make the rate limiter treat all users as one client. Set TRUST_PROXY=1
  // (number of proxy hops) in that environment so the real client IP from
  // X-Forwarded-For is used. Leave unset when running directly.
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
  }

  configureApp(app);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
