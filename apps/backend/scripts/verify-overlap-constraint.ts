import 'dotenv/config';

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log('Creating throwaway Space → Zone → Desk → User...');

  const space = await prisma.space.create({
    data: { name: 'Overlap Test Space', slug: `overlap-test-${Date.now()}` },
  });
  const zone = await prisma.zone.create({
    data: { name: 'Test Zone', spaceId: space.id },
  });
  const desk = await prisma.desk.create({
    data: { name: 'Test Desk', zoneId: zone.id },
  });
  const user = await prisma.user.create({
    data: {
      email: `overlap-test-${Date.now()}@example.com`,
      role: 'MEMBER',
      spaceId: space.id,
    },
  });

  console.log(`Desk: ${desk.id}`);

  const first = { startTime: new Date('2026-09-01T09:00:00Z'), endTime: new Date('2026-09-01T11:00:00Z') };
  const second = { startTime: new Date('2026-09-01T10:00:00Z'), endTime: new Date('2026-09-01T12:00:00Z') }; 
  console.log('\nCreating first booking (9:00-11:00)...');
  const booking1 = await prisma.booking.create({
    data: { bookableType: 'DESK', bookableId: desk.id, userId: user.id, ...first },
  });
  console.log(`✅ Created: ${booking1.id}`);

  console.log('\nCreating second, OVERLAPPING booking (10:00-12:00, same desk)...');
  console.log('This MUST fail if the exclusion constraint is working.\n');

  try {
    const booking2 = await prisma.booking.create({
      data: { bookableType: 'DESK', bookableId: desk.id, userId: user.id, ...second },
    });
    console.log(`❌ PROBLEM: second booking succeeded (${booking2.id}) — the`);
    console.log('   overlap constraint is NOT active. Check that migration');
    console.log('   20260821202823_add_booking_overlap_exclusion actually ran');
    console.log('   (npx prisma migrate status) and that btree_gist extension exists.');
  } catch (err: unknown) {
    console.log('✅ Second booking was rejected, as expected. Inspecting the error:\n');
    console.log('Constructor name:', (err as object)?.constructor?.name);
    console.log(
      'Is PrismaClientKnownRequestError:',
      err instanceof Prisma.PrismaClientKnownRequestError,
    );
    console.log(
      'Is PrismaClientUnknownRequestError:',
      err instanceof Prisma.PrismaClientUnknownRequestError,
    );
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.log('.code:', err.code);
    }
    console.log('.message:', (err as { message?: string }).message);

    const message = (err as { message?: string }).message ?? '';
    const matchesServiceRegex = /23P01|no_overlapping_bookings/.test(message);
    console.log(
      `\nDoes bookings.service.ts's detection regex match this error? ${
        matchesServiceRegex ? '✅ YES — the fix works as written' : '❌ NO — needs adjusting'
      }`,
    );

    if (!matchesServiceRegex) {
      console.log(
        '\nIf NO: paste this script\'s full output back and the regex in',
        'bookings.service.ts (search for "23P01") needs to be updated to',
        'match whatever this error actually looks like.',
      );
    }
  }

  console.log('\nCleaning up throwaway data...');
  await prisma.booking.deleteMany({ where: { bookableId: desk.id } });
  await prisma.desk.delete({ where: { id: desk.id } });
  await prisma.zone.delete({ where: { id: zone.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.space.delete({ where: { id: space.id } });
  await prisma.$disconnect();

  console.log('Done.');
}

main().catch((e) => {
  console.error('Script itself failed (not the thing being tested):', e);
  process.exit(1);
});
