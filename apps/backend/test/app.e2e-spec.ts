import * as request from 'supertest';
import { bootstrapE2e, E2eContext } from './helpers/e2e-app';

describe('AppController (e2e)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await bootstrapE2e();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET / is public (health check) and needs no token', async () => {
    await request(ctx.app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
