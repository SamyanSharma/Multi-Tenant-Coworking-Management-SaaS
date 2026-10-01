import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { bootstrapE2e, createTenant, E2eContext } from './helpers/e2e-app';

// Proves tenant isolation and role enforcement end to end, through the real
// guards with real signed JWTs. Tenant identity comes ONLY from the verified
// token; the x-space-id header must never widen a manager's or member's scope.
describe('Tenant isolation & RBAC (e2e)', () => {
  let ctx: E2eContext;
  let A: Awaited<ReturnType<typeof createTenant>>;
  let B: Awaited<ReturnType<typeof createTenant>>;

  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await bootstrapE2e();
    A = await createTenant(ctx, 'IsoA');
    B = await createTenant(ctx, 'IsoB');
  });

  afterAll(async () => {
    await ctx.cleanup([A.space.id, B.space.id]);
    await ctx.app.close();
  });

  describe('authentication', () => {
    it('rejects a request with no token (401)', async () => {
      await http().get('/zones').expect(401);
    });

    it('rejects a token signed with the wrong secret (401)', async () => {
      const forged = new JwtService({ secret: 'not-the-real-secret' }).sign({
        sub: A.manager.id,
        role: 'SPACE_MANAGER',
        spaceId: A.space.id,
      });
      await http().get('/zones').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('keeps the health route public', async () => {
      await http().get('/').expect(200);
    });
  });

  describe('tenant isolation', () => {
    it("404s Space A's zone for a manager of Space B (not 403 - existence must not leak)", async () => {
      await http()
        .get(`/zones/${A.zone.id}`)
        .set('Authorization', `Bearer ${B.managerToken}`)
        .expect(404);
    });

    it("allows Space A's own manager to read Space A's zone", async () => {
      await http()
        .get(`/zones/${A.zone.id}`)
        .set('Authorization', `Bearer ${A.managerToken}`)
        .expect(200);
    });

    it('ignores a spoofed x-space-id header: manager B cannot reach Space A by claiming it', async () => {
      await http()
        .get(`/zones/${A.zone.id}`)
        .set('Authorization', `Bearer ${B.managerToken}`)
        .set('x-space-id', A.space.id)
        .expect(404);
    });

    it('ignores a spoofed x-space-id header the other way: manager A is still scoped to A', async () => {
      await http()
        .get(`/zones/${A.zone.id}`)
        .set('Authorization', `Bearer ${A.managerToken}`)
        .set('x-space-id', B.space.id)
        .expect(200);
    });

    it("never lists another tenant's desks", async () => {
      const res = await http()
        .get('/desks')
        .set('Authorization', `Bearer ${B.managerToken}`)
        .expect(200);
      const ids = (res.body as { id: string }[]).map((d) => d.id);
      expect(ids).toContain(B.desk.id);
      expect(ids).not.toContain(A.desk.id);
    });

    it("a member of Space B cannot book Space A's desk (404)", async () => {
      await http()
        .post('/bookings')
        .set('Authorization', `Bearer ${B.memberToken}`)
        .send({
          bookableType: 'DESK',
          bookableId: A.desk.id,
          startTime: '2031-03-01T10:00:00.000Z',
          endTime: '2031-03-01T11:00:00.000Z',
        })
        .expect(404);
    });

    it("a member only ever sees their own bookings via GET /bookings", async () => {
      const other = await ctx.prisma.booking.create({
        data: {
          bookableType: 'DESK',
          bookableId: A.desk.id,
          userId: A.manager.id, // any other user in the space
          spaceId: A.space.id,
          startTime: new Date('2031-04-01T10:00:00.000Z'),
          endTime: new Date('2031-04-01T11:00:00.000Z'),
          amountCents: 1000,
        },
      });

      const res = await http()
        .get('/bookings')
        .set('Authorization', `Bearer ${A.memberToken}`)
        .expect(200);
      expect((res.body as { id: string }[]).map((b) => b.id)).not.toContain(other.id);

      const asManager = await http()
        .get('/bookings')
        .set('Authorization', `Bearer ${A.managerToken}`)
        .expect(200);
      expect((asManager.body as { id: string }[]).map((b) => b.id)).toContain(other.id);
    });
  });

  describe('role-based access control', () => {
    it('forbids a MEMBER from creating a zone (403)', async () => {
      await http()
        .post('/zones')
        .set('Authorization', `Bearer ${A.memberToken}`)
        .send({ name: 'Nope' })
        .expect(403);
    });

    it('lets a SPACE_MANAGER create a zone (201)', async () => {
      await http()
        .post('/zones')
        .set('Authorization', `Bearer ${A.managerToken}`)
        .send({ name: 'Manager made this' })
        .expect(201);
    });

    it('forbids a SPACE_MANAGER from the cross-tenant space list (403)', async () => {
      await http()
        .get('/spaces')
        .set('Authorization', `Bearer ${A.managerToken}`)
        .expect(403);
    });

    it('lets a PLATFORM_ADMIN list every space (200)', async () => {
      const admin = await ctx.prisma.user.create({
        data: { email: `admin-${ctx.uid()}@e2e.local`, role: 'PLATFORM_ADMIN' },
      });
      try {
        const token = ctx.tokenFor({ id: admin.id, role: 'PLATFORM_ADMIN', spaceId: null });
        await http().get('/spaces').set('Authorization', `Bearer ${token}`).expect(200);
      } finally {
        await ctx.prisma.user.delete({ where: { id: admin.id } });
      }
    });

    // These two routes had no @Roles() at all before RbacGuard became
    // global + deny-by-default; they now declare their roles explicitly.
    it('GET /spaces/me works for a manager and returns THEIR space', async () => {
      const res = await http()
        .get('/spaces/me')
        .set('Authorization', `Bearer ${A.managerToken}`)
        .expect(200);
      expect((res.body as { id: string }).id).toBe(A.space.id);
    });

    it("GET /spaces/:id refuses another tenant's space id", async () => {
      const res = await http()
        .get(`/spaces/${A.space.id}`)
        .set('Authorization', `Bearer ${B.managerToken}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(res.body)).not.toContain(A.space.name);
    });
  });
});
