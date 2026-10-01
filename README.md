
# Multi-Tenant Coworking Management SaaS

A multi-tenant SaaS API for managing coworking space(s): Spaces, Zones, Desks, Rooms, Bookings, Payments, etc., with tenant isolation via role-based access control for the API endpoints.

## Overview

Each Space (a coworking business/tenant) has its Zones which host bookable Desks and Rooms. Members book Desks/Rooms in a particular Space for a period of time. Space Managers onboard to Stripe to get payouts for the bookings in their Space. The Platform Admins manage everything across all spaces. Each API request is scoped to a particular Space based on the x-space-id header. All write operations are guarded by role-based access control.

## Monorepo structure
```
.

├── apps/
│  ├── backend/  # NestJS API, Prisma/Postgres, Stripe Connect
│  └── frontend/  # Next.js dashboard, App Router
├── docker-compose.yml  # Local DB
└── package.json     # NPM workspaces
```

## Backend (apps/backend)

Built with NestJS and Prisma on Postgres
Features:
- Core modules:

spaces, zones, desks, rooms, bookings, payments, analytics
- Multi-tenancy:
Each request must have x-space-id header (unless the route is marked as tenantless), which scopes database queries to a particular space.
- Authentication:
`POST /auth/login` (email + password) returns a JWT. Send it as
`Authorization: Bearer <token>` on every other request, and as
`{ auth: { token } }` on the Socket.io handshake. Passwords are hashed
with bcrypt; nothing about identity is trusted from request headers.
- Access control:
Endpoints are guarded by an `RbacGuard` and authorized using `@Roles()` decorator, reading the role off the verified JWT. Available roles: `PLATFORM_ADMIN`, `SPACE_MANAGER`, `MEMBER`.
- Creating a booking:
Desks and Rooms are polymorphically associated with Bookings via bookableType and bookableId columns. Overlapping bookings for the same desk or room are prevented at the DB level with a PostgreSQL exclusion constraint. Unique constraint on `resourceId` and `start` also prevent double-booking.

- Payments:
Stripe Connect is used for payouts to Space Managers. Booking record tracks the payment status (UNPAID → PENDING → PAID/FAILED). Stripe refunds are not supported; refunding is implemented as a cancellation of a booking. Booking price is snapshotted at the moment of creation to prevent changing it after booking.
- Realtime:
Socket.IO is used to notify clients about updates (bookings, availability changes). Socket.IO server is hosted at the NestJS backend.
- Analytics:
Has an endpoint for retrieving space-level reports.

## Frontend (apps/frontend)
Built with Next.js (App Router), React, Zustand state management, Tailwind CSS
Features:
- Dashboard with an overview of Spaces, Zones, Bookings
- Ability to make bookings
- Booking analytics
- Settings/config page
- Stripe onboarding for Space Managers
## Tech stack
| Layer | Tech |
| --- | --- |
| Backend framework | NestJS 11 |
| Database / ORM | PostgreSQL, Prisma |
| Realtime | Socket.IO |
| Payments | Stripe (Connect) |

| Frontend framework | Next.js 16, React 19 |

| Frontend state management | Zustand |
| Styling | Tailwind CSS |
| Testing | Jest (backend), Vitest (frontend) |
## Getting started
### Prerequisites
- Node.js
- npm
- Docker (or a local Postgres instance)
- A Stripe account (optional)
### 1. Install dependencies
From the repo root (this is an npm workspaces project):
```
npm install
```
### 2. Start the database
```
docker compose up -d
```
This will start a local PostgreSQL database (see docker-compose.yml for user/pass).
### 3. Set up environment variables
Backend (apps/backend/.env):
```
DATABASE_URL=postgresql://coworking:coworking_dev_pw@localhost:5432/coworking_dev
PORT=3000
FRONTEND_URL=http://localhost:3001
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
JWT_SECRET=some-long-random-string
```
`JWT_SECRET` signs/verifies auth tokens. The app falls back to an
insecure dev default if unset, but refuses to boot with that fallback
when `NODE_ENV=production` — always set a real value outside local dev.
Frontend (apps/frontend/.env.local, see .env.local.example):
```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```
### 4. Run database migrations
```
cd apps/backend
npx prisma migrate deploy
```
### 5. Launch the apps
From the repo root:
```
npm run dev:backend  # NestJS API at http://localhost:3000
npm run dev:frontend  # Next.js dashboard at http://localhost:3001
```
## Testing
```
# Backend unit tests
cd apps/backend && npm run test
# Backend E2E tests
cd apps/backend && npm run test:e2e
# Frontend tests
cd apps/frontend && npm run test
```

## API conventions

- Every protected route requires `Authorization: Bearer <token>` from `POST /auth/login`, except routes marked `@Public()` (login itself, the health check, the Stripe webhook).
- `SPACE_MANAGER`/`MEMBER` are scoped to the space in their own token automatically — they don't send `x-space-id` at all. `PLATFORM_ADMIN` isn't tied to one space, so it may still send `x-space-id` to target a specific one on routes that need it.
- `x-user-role`/`x-user-id` headers no longer exist — role and user identity come from the verified token, not request headers.

## License

See LICENSE.

