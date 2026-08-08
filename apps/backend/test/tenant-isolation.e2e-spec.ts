import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// This test hits a real (dev) database via PrismaService — pragmatic
// shortcut for a capstone timeline rather than standing up a dedicated
// test database. It cleans up after itself but could be flaky if run
// concurrently with manual testing against the same DB. See
// prisma/optional-migrations/README.md-style note in PROGRESS.md.
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let spaceA: { id: string };
  let spaceB: { id: string };
  let zoneInSpaceA: { id: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);

    // Seed two separate tenants directly via Prisma, bypassing the API,
    // so test setup doesn't depend on the very endpoints being tested.
    spaceA = await prisma.space.create({
      data: { name: 'Space A', slug: `space-a-${Date.now()}` },
    });
    spaceB = await prisma.space.create({
      data: { name: 'Space B', slug: `space-b-${Date.now()}` },
    });
    zoneInSpaceA = await prisma.zone.create({
      data: { name: 'Zone A1', spaceId: spaceA.id },
    });
  });

  afterAll(async () => {
    // Reverse-dependency order (children before parents) even though
    // onDelete: Cascade is set — explicit is safer for test cleanup.
    await prisma.zone.deleteMany({
      where: { spaceId: { in: [spaceA.id, spaceB.id] } },
    });
    await prisma.space.deleteMany({
      where: { id: { in: [spaceA.id, spaceB.id] } },
    });
    await app.close();
  });

  it("rejects a request for Space A's zone when scoped as Space B", async () => {
    // This is the test that actually proves isolation works, not just
    // that CRUD works — if ZonesService.findOne's spaceId check ever
    // gets accidentally removed in a refactor, this is the test that
    // catches it (the others would still pass).
    await request(app.getHttpServer())
      .get(`/zones/${zoneInSpaceA.id}`)
      .set('x-space-id', spaceB.id)
      .set('x-user-role', 'SPACE_MANAGER')
      .expect(403);
  });

  it('allows the same request when correctly scoped as Space A', async () => {
    await request(app.getHttpServer())
      .get(`/zones/${zoneInSpaceA.id}`)
      .set('x-space-id', spaceA.id)
      .set('x-user-role', 'SPACE_MANAGER')
      .expect(200);
  });

  it('rejects requests with no x-space-id header at all (global TenantGuard)', async () => {
    await request(app.getHttpServer()).get('/zones').expect(400);
  });

  it('allows the health route through without a spaceId header', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });
});
