import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Make sure apps/backend/.env exists and contains DATABASE_URL.',
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Fixed, hardcoded dev-only IDs (NOT real cuids from a random run).
//
// These exist so `apps/frontend/app/dev-login/page.tsx` can hardcode
// matching userIds/spaceId and NOT go stale every time someone reseeds
// or resets the DB — Prisma's default `@default(cuid())` would otherwise
// generate a new id per run, which is exactly the "stale localStorage
// id -> silent 404" bug class this project already hit once (see
// PROGRESS.md's 2026-08-23 evening entry). Keep these two files in sync
// if either changes. Both dev-login and this pinning should be removed
// together before a real/final deployment — see PROGRESS.md.
const DEV_SPACE_ID = 'devseed_space_0000000001';
const DEV_MANAGER_ID = 'devseed_user_manager_001';
const DEV_MEMBER_ID = 'devseed_user_member_0001';

async function main() {
  const space = await prisma.space.upsert({
    where: { slug: 'test-space' },
    update: {},
    create: {
      id: DEV_SPACE_ID,
      name: 'Test Space',
      slug: 'test-space',
      priceCents: 1500,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@test-space.dev' },
    update: { spaceId: space.id, role: Role.SPACE_MANAGER },
    create: {
      id: DEV_MANAGER_ID,
      email: 'manager@test-space.dev',
      name: 'Test Space Manager',
      role: Role.SPACE_MANAGER,
      spaceId: space.id,
    },
  });

  const member = await prisma.user.upsert({
    where: { email: 'member@test-space.dev' },
    update: { spaceId: space.id, role: Role.MEMBER },
    create: {
      id: DEV_MEMBER_ID,
      email: 'member@test-space.dev',
      name: 'Test Member',
      role: Role.MEMBER,
      spaceId: space.id,
    },
  });

  let zone = await prisma.zone.findFirst({
    where: { spaceId: space.id, name: 'Main Floor' },
  });
  if (!zone) {
    zone = await prisma.zone.create({
      data: { name: 'Main Floor', spaceId: space.id },
    });
  }

  for (const name of ['Desk 1', 'Desk 2']) {
    const existing = await prisma.desk.findFirst({
      where: { zoneId: zone.id, name },
    });
    if (!existing) {
      await prisma.desk.create({ data: { name, zoneId: zone.id } });
    }
  }

  const existingRoom = await prisma.room.findFirst({
    where: { zoneId: zone.id, name: 'Conference Room A' },
  });
  if (!existingRoom) {
    await prisma.room.create({
      data: { name: 'Conference Room A', capacity: 6, zoneId: zone.id },
    });
  }

  console.log('Seed complete:');
  console.log({
    spaceId: space.id,
    managerId: manager.id,
    memberId: member.id,
    zoneId: zone.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });