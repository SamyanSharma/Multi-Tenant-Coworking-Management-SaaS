'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

// TEMPORARY — stands in for real Stage 2 login. Replace with the actual
// auth flow once Teammate A's login endpoint exists.
//
// userId field: POST /bookings requires an x-user-id header that is a
// REAL foreign key to a User row in Postgres. There is no /users
// endpoint yet to create one from the frontend, and no seed script in
// the repo — so if you want to test booking creation, paste in a real
// User.id here (e.g. one you created via Prisma Studio). Everything
// else (viewing spaces/zones/desks/rooms) works without this.
export default function Home() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const role = useAuthStore((s) => s.role);
  const [userId, setUserId] = useState('');

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 gap-6 p-16">
      <h1 className="text-2xl font-semibold">Coworking SaaS — Dev Login</h1>
      {role && <p className="text-sm text-slate-500">Currently signed in as {role}</p>}

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          User ID (optional — only needed to test booking creation; must be
          a real User.id from Postgres, e.g. via Prisma Studio)
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="cmxxxxxxxxxxxxxxxxxxxxxxx"
            className="border rounded px-2 py-1 text-sm"
          />
        </label>

        <button
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm"
          onClick={() =>
            setAuth({ token: 'dummy', role: 'PLATFORM_ADMIN', spaceId: null, userId: userId || null })
          }
        >
          Log in as Platform Admin
        </button>
        <button
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm"
          onClick={() =>
            setAuth({
              token: 'dummy',
              role: 'SPACE_MANAGER',
              spaceId: 'cmslgiyh400003gmlmy7rvxvd',
              userId: userId || null,
            })
          }
        >
          Log in as Space Manager
        </button>
        <button
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm"
          onClick={() =>
            setAuth({
              token: 'dummy',
              role: 'MEMBER',
              spaceId: 'cmslgiyh400003gmlmy7rvxvd',
              userId: userId || null,
            })
          }
        >
          Log in as Member
        </button>
        <Link
          href="/dashboard/spaces"
          className="text-center border rounded px-4 py-2 text-sm mt-2"
        >
          Go to dashboard →
        </Link>
      </div>
    </div>
  );
}
