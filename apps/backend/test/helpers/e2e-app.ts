import { Test, TestingModuleBuilder } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface E2eContext {
  app: INestApplication;
  prisma: PrismaService;
  /** A real signed JWT, identical in shape to what POST /auth/login issues. */
  tokenFor: (user: {
    id: string;
    role: 'PLATFORM_ADMIN' | 'SPACE_MANAGER' | 'MEMBER';
    spaceId: string | null;
  }) => string;
  /** Short random suffix so parallel/repeated runs never collide on unique columns. */
  uid: () => string;
  /** Deletes everything created for the given spaces, children first. */
  cleanup: (spaceIds: string[], extraUserIds?: string[]) => Promise<void>;
}

/**
 * Boots the real AppModule with the same HTTP config as main.ts.
 * Pass `customize` to stub providers (e.g. StripeService).
 */
export async function bootstrapE2e(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<E2eContext> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (customize) builder = customize(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();

  const prisma = moduleRef.get(PrismaService);
  const jwt = moduleRef.get(JwtService, { strict: false });

  return {
    app,
    prisma,
    tokenFor: (u) => jwt.sign({ sub: u.id, role: u.role, spaceId: u.spaceId }),
    uid: () => randomUUID().slice(0, 8),
    cleanup: async (spaceIds, extraUserIds = []) => {
      // Order matters: Booking -> (Desk/Room) -> Zone -> User -> Space,
      // because Booking/User foreign keys are ON DELETE RESTRICT.
      await prisma.booking.deleteMany({ where: { spaceId: { in: spaceIds } } });
      await prisma.desk.deleteMany({ where: { zone: { spaceId: { in: spaceIds } } } });
      await prisma.room.deleteMany({ where: { zone: { spaceId: { in: spaceIds } } } });
      await prisma.zone.deleteMany({ where: { spaceId: { in: spaceIds } } });
      await prisma.user.deleteMany({
        where: { OR: [{ spaceId: { in: spaceIds } }, { id: { in: extraUserIds } }] },
      });
      await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
    },
  };
}

/** One tenant: a space, its one manager, one member, a zone and a rated desk. */
export async function createTenant(
  ctx: E2eContext,
  label: string,
  opts: { stripeOnboarded?: boolean } = {},
) {
  const s = ctx.uid();
  const space = await ctx.prisma.space.create({
    data: { name: `${label} ${s}`, slug: `${label.toLowerCase()}-${s}` },
  });
  const manager = await ctx.prisma.user.create({
    data: {
      email: `manager-${label.toLowerCase()}-${s}@e2e.local`,
      role: 'SPACE_MANAGER',
      spaceId: space.id,
      ...(opts.stripeOnboarded && {
        stripeAccountId: `acct_e2e_${s}`,
        stripeOnboardingComplete: true,
      }),
    },
  });
  const member = await ctx.prisma.user.create({
    data: {
      email: `member-${label.toLowerCase()}-${s}@e2e.local`,
      role: 'MEMBER',
      spaceId: space.id,
    },
  });
  const zone = await ctx.prisma.zone.create({
    data: { name: `Zone ${label}`, spaceId: space.id },
  });
  const desk = await ctx.prisma.desk.create({
    data: { name: `Desk ${label}`, zoneId: zone.id, hourlyRateCents: 1000 },
  });

  return {
    space,
    zone,
    desk,
    manager,
    member,
    managerToken: ctx.tokenFor({ id: manager.id, role: 'SPACE_MANAGER', spaceId: space.id }),
    memberToken: ctx.tokenFor({ id: member.id, role: 'MEMBER', spaceId: space.id }),
  };
}
