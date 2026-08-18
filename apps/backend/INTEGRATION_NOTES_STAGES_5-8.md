# Backend Stages 5-8 — integration notes

Builds directly on top of the Stage 1-4 delivery (`backend-stages-1-4-FIXED.zip`),
already updated to match your real repo's Prisma 7 driver-adapter pattern
(`@prisma/adapter-pg` + `dotenv/config` in `main.ts`) per `ARCHITECTURE.md`'s
Key Decisions Log.

## What's new in this delivery

- `src/events/` — Socket.io gateway (Stage 5), `spaceId`-scoped rooms
- `src/payments/` — Stripe Connect fee-split service + webhook controller (Stage 6)
- `src/analytics/` — read-only aggregation endpoints (Stage 7)
- `src/payments/stripe.service.spec.ts`, `src/events/events.gateway.spec.ts` — unit tests (Stage 8, partial)
- `prisma/schema.prisma` — new fields: `User.stripeAccountId`,
  `Booking.paymentStatus`/`amountCents`/`stripePaymentIntentId`, new
  `PaymentStatus` enum. **This is a real schema change, not additive-only
  — you'll need a new migration**, not just `prisma generate`:
  ```bash
  npx prisma migrate dev --name add_payment_tracking
  ```
- `package.json` — added `@prisma/adapter-pg`, `@nestjs/websockets`,
  `@nestjs/platform-socket.io`, `socket.io`, `stripe`
- `.env.example` — added `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PORT`

## Required env vars before any of this runs

```
STRIPE_SECRET_KEY="sk_test_..."     # from https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET="whsec_..."   # from `stripe listen` (local) or dashboard (deployed)
FRONTEND_URL="http://localhost:3001"  # optional, used for Connect onboarding redirect URLs
```

**`StripeService` refuses to start (throws in its constructor) if either
is missing, or if the secret key isn't a `sk_test_...` key** — this is
deliberate, not a bug, per the task doc's "TEST MODE ONLY" instruction.
This means the whole app will fail to boot without these set, not just
the payments feature — worth knowing before you run `npm run start:dev`
and wonder why nothing starts.

## Testing the webhook locally

Signature verification requires the Stripe CLI to generate real signed
test events — you can't `curl` this endpoint with a fake signature and
expect it to pass (that's the point):

```bash
stripe listen --forward-to localhost:3000/payments/webhook
# in another terminal:
stripe trigger payment_intent.succeeded
```

## Testing the Socket.io gateway locally

From the frontend or a quick Node script:
```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000', {
  auth: { spaceId: 'cku8x2vwn0000abcd1234efgh' },
});
socket.on('booking_created', (data) => console.log('received:', data));
socket.on('connection_error', (err) => console.log('rejected:', err));
```
Then `POST /bookings` via REST as normal — the socket connected with a
matching `spaceId` should receive `booking_created`; a socket connected
with a *different* `spaceId` should not.

## Known gaps, flagged deliberately (not silently missing)

- **No endpoint creates a PaymentIntent for an actual booking yet.**
  `stripe.service.ts` has `createBookingPaymentIntent()` ready to call,
  but nothing in `bookings.controller.ts` invokes it — wire this in once
  pricing (next point) is decided.
- **No price field exists on Desk/Room.** `Booking.amountCents` has to be
  supplied by the caller for now. Real product decision needed (flat
  per-space pricing? per-desk/room? time-based?).
- **Booking overlap constraint** — still the open Stage 1-4 team decision,
  untouched.
- **Analytics role restriction** — my assumption
  (`SPACE_MANAGER`/`PLATFORM_ADMIN`), flagged in code comments, not a
  documented product decision.
- **CORS on the Socket.io gateway is wide open (`origin: '*'`)** —
  commented as a pre-deployment TODO.
- **Stripe Connect onboarding is now built** (`stripe.service.ts`'s
  `createOrGetConnectAccount`/`createOnboardingLink`,
  `payments.controller.ts`'s `POST /payments/onboard`,
  `webhook.controller.ts`'s `account.updated` handler flipping
  `User.stripeOnboardingComplete`) — was previously a TODO, added in a
  follow-up pass this session. `FRONTEND_URL` env var is read for the
  onboarding redirect URLs, defaulting to `http://localhost:3001` — set
  this explicitly once a real frontend origin exists.

## Verification performed in this sandbox (same limitation as before)

This sandbox cannot reach `binaries.prisma.sh`, so `prisma generate`
could not run here. I categorized every `npm run build` error and
confirmed 39/40 are directly and only caused by the missing generated
Prisma client; the 1 remaining (`'err' is of type 'unknown'` in
`bookings.service.ts`) is a downstream consequence of the same cause
(type narrowing on `Prisma.PrismaClientKnownRequestError` fails when
`Prisma` itself can't resolve). **A real bug unrelated to Prisma was
found and fixed**: `tenant.guard.ts`/`rbac.guard.ts` had a side-effect
import (`import './request-with-tenant';`) that compiled fine under
`nest build` but broke `ts-jest` (which can't tell a pure `.d.ts`
ambient-declaration file produces no runtime module) — removed from both
files, `tenant.guard.spec.ts` confirmed to go from failing to passing
as a direct result, `npm run build`'s error count/categories unchanged
before and after (no regression).

Test suite as of this session: 19 tests passing across 4 suites
(`app.controller.spec.ts`, `tenant.guard.spec.ts`,
`stripe.service.spec.ts`, `events.gateway.spec.ts`). `rbac.guard.spec.ts`
still fails in this sandbox — same Prisma-client-unavailable cause, not a
new issue. Run `npx prisma generate && npx jest` in your real environment
to confirm it passes there.
