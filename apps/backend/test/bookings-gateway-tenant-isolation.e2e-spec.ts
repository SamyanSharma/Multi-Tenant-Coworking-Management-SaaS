import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Covers recommendation #4 from review: the userRole/spaceId validation
// added to BookingsGateway.handleConnection() confirms a connection is
// well-formed, but nothing previously proved that Socket.io ROOMS
// actually isolate tenants — i.e. that a client joined to Space A's room
// never receives an event emitted to Space B's room. This test boots a
// real server (not just AppModule.compile()) so real socket.io-client
// connections can be made against it, same as tenant-isolation.e2e-spec.ts
// hits a real database rather than mocking Prisma.
describe('Bookings gateway tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  let spaceA: { id: string };
  let spaceB: { id: string };
  let zoneInSpaceA: { id: string };
  let deskInSpaceA: { id: string };
  let memberInSpaceA: { id: string };

  let clientInSpaceA: ClientSocket;
  let clientInSpaceB: ClientSocket;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    // Real listen(), not just init() — Socket.io needs an actual HTTP
    // server to attach to; supertest's app.getHttpServer() alone isn't
    // enough for socket.io-client to connect against.
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://localhost:${address.port}`;

    prisma = moduleRef.get(PrismaService);

    spaceA = await prisma.space.create({
      data: { name: 'Gateway Space A', slug: `gateway-space-a-${Date.now()}` },
    });
    spaceB = await prisma.space.create({
      data: { name: 'Gateway Space B', slug: `gateway-space-b-${Date.now()}` },
    });
    zoneInSpaceA = await prisma.zone.create({
      data: { name: 'Gateway Zone A1', spaceId: spaceA.id },
    });
    deskInSpaceA = await prisma.desk.create({
      data: { name: 'Gateway Desk A1', zoneId: zoneInSpaceA.id },
    });
    memberInSpaceA = await prisma.user.create({
      data: {
        email: `gateway-member-a-${Date.now()}@example.com`,
        role: 'MEMBER',
        spaceId: spaceA.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.desk.deleteMany({ where: { id: deskInSpaceA.id } });
    await prisma.zone.deleteMany({ where: { id: zoneInSpaceA.id } });
    await prisma.user.deleteMany({ where: { id: memberInSpaceA.id } });
    await prisma.space.deleteMany({ where: { id: { in: [spaceA.id, spaceB.id] } } });
    await app.close();
  });

  afterEach(() => {
    clientInSpaceA?.disconnect();
    clientInSpaceB?.disconnect();
  });

  it("does not deliver Space A's booking_created event to a client scoped to Space B", async () => {
    clientInSpaceA = io(baseUrl, {
      auth: { spaceId: spaceA.id, userRole: 'MEMBER', userId: memberInSpaceA.id },
      transports: ['websocket'],
    });
    clientInSpaceB = io(baseUrl, {
      auth: { spaceId: spaceB.id, userRole: 'MEMBER', userId: 'irrelevant-for-this-test' },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => clientInSpaceA.on('connect', () => resolve())),
      new Promise<void>((resolve) => clientInSpaceB.on('connect', () => resolve())),
    ]);

    const receivedByA: unknown[] = [];
    const receivedByB: unknown[] = [];
    clientInSpaceA.on('booking_created', (payload) => receivedByA.push(payload));
    clientInSpaceB.on('booking_created', (payload) => receivedByB.push(payload));

    await request(app.getHttpServer())
      .post('/bookings')
      .set('x-space-id', spaceA.id)
      .set('x-user-role', 'MEMBER')
      .set('x-user-id', memberInSpaceA.id)
      .send({
        bookableType: 'DESK',
        bookableId: deskInSpaceA.id,
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    // Give the emit a moment to arrive — this is the one inherently timing-
    // dependent part of this test. If this proves flaky in CI, replace with
    // a short explicit wait-for-event-or-timeout helper instead of a bare
    // setTimeout.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(receivedByA).toHaveLength(1);
    expect(receivedByB).toHaveLength(0);
  });
});
