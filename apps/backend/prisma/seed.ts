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

async function main() {
  const space = await prisma.space.upsert({
    where: { slug: 'test-space' },
    update: {},
    create: {
      name: 'Test Space',
      slug: 'test-space',
      priceCents: 1500,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@test-space.dev' },
    update: { spaceId: space.id, role: Role.SPACE_MANAGER },
    create: {
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