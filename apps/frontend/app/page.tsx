'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

// TEMPORARY — stands in for real Stage 2 login. Replace with the actual
// auth flow once Teammate A's login endpoint exists.
export default function Home() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const role = useAuthStore((s) => s.role);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 gap-6 p-16">
      <h1 className="text-2xl font-semibold">Coworking SaaS — Dev Login</h1>
      {role && <p className="text-sm text-slate-500">Currently signed in as {role}</p>}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm"
          onClick={() =>
            setAuth({ token: 'dummy', role: 'PLATFORM_ADMIN', spaceId: null })
          }
        >
          Log in as Platform Admin
        </button>
        <button
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm"
          onClick={() =>
            setAuth({ token: 'dummy', role: 'SPACE_MANAGER', spaceId: 'space_1' })
          }
        >
          Log in as Space Manager
        </button>
        <button
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm"
          onClick={() =>
            setAuth({ token: 'dummy', role: 'MEMBER', spaceId: 'space_1' })
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
