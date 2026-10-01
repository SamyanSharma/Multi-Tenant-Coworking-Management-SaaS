import * as request from 'supertest';
import { bootstrapE2e, E2eContext } from './helpers/e2e-app';

describe('Security hardening (e2e)', () => {
  let ctx: E2eContext;
  const originalEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    // The throttler is skipped when NODE_ENV === 'test' (so the other specs
    // can hammer the API). Switch it on for this file only; it is read per
    // request, so restoring it in afterAll is enough.
    process.env.NODE_ENV = 'e2e-throttle';
    ctx = await bootstrapE2e();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalEnv;
    await ctx.app.close();
  });

  it('sends helmet security headers and hides X-Powered-By', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rate-limits repeated login attempts: the 11th within a minute gets 429', async () => {
    const attempt = () =>
      request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: `nobody-${ctx.uid()}@e2e.local`, password: 'wrong-password' });

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('does not rate-limit the public health route at the login limit', async () => {
    for (let i = 0; i < 15; i++) {
      await request(ctx.app.getHttpServer()).get('/').expect(200);
    }
  });
});
