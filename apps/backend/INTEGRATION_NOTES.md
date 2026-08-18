# Backend Stages 1-4 — integration notes

This folder is a standalone, buildable NestJS project implementing every
file listed in your task doc (Teammate A / Backend & Data Layer), built
against the schema described in `ARCHITECTURE.md`.

## How to bring this into your actual repo

This was built fresh (via `nest new`) rather than edited in-place inside
your existing `apps/backend`, since I didn't have your real repo's files
here — only the four docs you uploaded. To merge it in:

1. Diff `src/`, `prisma/schema.prisma`, `test/`, and the `package.json`
   dependency list here against your real `apps/backend`.
2. Your real project already has Stage 0 done (migration applied,
   verified in Prisma Studio per PROGRESS.md) — don't blindly overwrite
   your existing `prisma/schema.prisma` or you'll lose that migration
   history. Compare the two schemas field-by-field first; they should
   match, but confirm before replacing.
3. Copy over `src/auth/`, `src/prisma/`, `src/spaces/`, `src/zones/`,
   `src/desks/`, `src/rooms/`, `src/bookings/`, and the updated
   `src/app.module.ts` / `src/main.ts` / `src/app.controller.ts`.
4. `npm install prisma @prisma/client class-validator class-transformer
   --workspace=backend` if you don't already have these.
5. `npx prisma generate --workspace=backend` (needs network access to
   Prisma's binary host — see caveat below).

## Important: not verified against a real Prisma Client

The sandbox this was built in cannot reach `binaries.prisma.sh` (network
policy), so `prisma generate` could not run here — meaning I could not
produce or type-check against a real generated `@prisma/client`.

I confirmed every remaining TypeScript build error in this environment
falls into exactly two categories, both directly caused by that missing
client:
- `Module '"@prisma/client"' has no exported member 'Role' / 'BookableType' / 'Prisma' / 'PrismaClient'`
- `Property 'space' / 'zone' / 'desk' / 'room' / 'booking' does not exist on type 'PrismaService'`

No other error categories existed. One real bug (unrelated to Prisma) was
caught and fixed in this process: `Request` from `express` needed to be a
type-only import (`import type { Request } from 'express'`) wherever it's
only used as a decorator parameter type, due to `isolatedModules` +
`emitDecoratorMetadata` in this project's `tsconfig.json`.

**Once you run `npx prisma generate` in your real environment (which
already works for you per PROGRESS.md), run `npm run build` again — it
should compile clean.** If it doesn't, the remaining error is worth
posting back for a proper fix rather than guessing blind.

## Running tests

```bash
npm run test        # unit tests: tenant.guard.spec.ts, rbac.guard.spec.ts
npm run test:e2e    # tenant-isolation.e2e-spec.ts — needs DATABASE_URL
                     # pointing at a real running Postgres (Docker
                     # container per your PROGRESS.md setup)
```

The e2e test seeds two real `Space` rows, creates a `Zone` in one, and
asserts a cross-tenant request gets rejected (403) while a correctly
scoped one succeeds (200) — this is the test that actually proves
isolation works, not just that CRUD works.

## Known limitations, carried over from our conversation

- **`TenantGuard` / `RbacGuard` trust headers directly** (`x-space-id`,
  `x-user-role`, and a placeholder `x-user-id` for bookings) — intentional
  per the Stage 1/2 plan, replaced once real auth exists. Not a bug.
- **Booking concurrency**: `@@unique([bookableType, bookableId,
  startTime])` only blocks exact-start-time collisions, not partial
  time-range overlaps. See `prisma/optional-migrations/README.md` for the
  Postgres exclusion-constraint alternative — deliberately NOT applied
  automatically; it's a team decision per the timeline tradeoff discussed
  in PRD.md.
- Rooms/Desks/Zones follow identical isolation patterns by design — a
  useful place to sanity-check for regressions if any of the three get
  edited independently later.
