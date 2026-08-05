import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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

    // Seed two separate tenants directly via Prisma — bypassing the API
    // so the test setup doesn't depend on the very endpoints being tested.
    spaceA = await prisma.space.create({ data: { name: 'Space A', slug: 'space-a' } });
    spaceB = await prisma.space.create({ data: { name: 'Space B', slug: 'space-b' } });
    zoneInSpaceA = await prisma.zone.create({
      data: { name: 'Zone A1', spaceId: spaceA.id },
    });
  });

  afterAll(async () => {
    // Clean up in reverse-dependency order (children before parents)
    // to satisfy FK constraints even though we've set onDelete: Cascade.
    await prisma.zone.deleteMany({ where: { spaceId: { in: [spaceA.id, spaceB.id] } } });
    await prisma.space.deleteMany({ where: { id: { in: [spaceA.id, spaceB.id] } } });
    await app.close();
  });

  it('rejects a request for Space A\'s zone when scoped as Space B', async () => {
    await request(app.getHttpServer())
      .get(`/zones/${zoneInSpaceA.id}`)
      .set('x-space-id', spaceB.id)
      .set('x-user-role', 'SPACE_MANAGER')
      .expect(403); // ForbiddenException from ZonesService.findOne's spaceId check
  });

  it('allows the same request when correctly scoped as Space A', async () => {
    await request(app.getHttpServer())
      .get(`/zones/${zoneInSpaceA.id}`)
      .set('x-space-id', spaceA.id)
      .set('x-user-role', 'SPACE_MANAGER')
      .expect(200);
  });
});
