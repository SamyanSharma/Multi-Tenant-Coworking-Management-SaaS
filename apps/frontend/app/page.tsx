import { redirect } from 'next/navigation';

// This page used to be a second, separately-hardcoded dev-login form
// with its own copy of the pinned seed IDs. It drifted out of sync with
// apps/backend/prisma/seed.ts and apps/frontend/app/dev-login/page.tsx
// (this one still had an old, stale spaceId literal that didn't match
// any real seeded Space, causing a 404 "Space not found") — see
// PROGRESS.md, 2026-08-25. Rather than maintain two copies of the same
// dev-only login that can silently drift apart again, `/` now just
// redirects to the one real dev-login page.
export default function Home() {
  redirect('/dev-login');
}
