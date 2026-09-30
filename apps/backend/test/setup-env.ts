// Runs before every e2e test file (see "setupFiles" in jest-e2e.json).
//
// 1. Database isolation. The e2e specs create and delete real rows, so they
//    must NOT run against the database you develop in. Point them at a
//    separate one:
//
//      TEST_DATABASE_URL=postgresql://coworking:coworking_dev_pw@localhost:5432/coworking_test
//
//    (create it once with `createdb`, then `npx prisma migrate deploy` with
//    DATABASE_URL set to it). PrismaService reads DATABASE_URL, and dotenv
//    never overrides a variable that is already set, so assigning it here is
//    enough.
//
// 2. Safe defaults for secrets the app insists on at boot. None of the e2e
//    specs talk to real Stripe (they stub StripeService or only use the
//    local signature helper), so dummy test-mode values are fine.
import 'dotenv/config';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '\n[e2e] TEST_DATABASE_URL is not set - falling back to DATABASE_URL. ' +
      'These tests create and delete rows; use a separate test database.\n',
  );
}

process.env.JWT_SECRET ??= 'e2e-only-secret';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_e2e_dummy_key';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_e2e_dummy_secret';
