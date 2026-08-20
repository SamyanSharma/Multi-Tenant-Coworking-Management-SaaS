'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface Zone {
  id: string;
  name: string;
}
interface SpaceInfo {
  id: string;
  name: string;
  slug: string;
}

// IMPORTANT: this page only works for the CALLER'S OWN space.
//
// There is no GET /spaces/:id endpoint on the backend — only GET /spaces
// (Platform_Admin-only list) and GET /spaces/me (caller's own space).
// GET /zones is also scoped to the caller's own space via the x-space-id
// header, and per ARCHITECTURE.md's RBAC table, PLATFORM_ADMIN currently
// has no route granting zone access at all (Space_Manager/Member only).
//
// So a Space_Manager clicking into their own space from /dashboard/spaces
// works correctly here. A Platform_Admin clicking into ANY space from the
// admin list will get a real 403 from GET /zones — which is CORRECT
// behavior given the backend's actual RBAC, not a bug. We show that
// clearly rather than pretending the feature works.
export default function SpaceDetailPage() {
  const { spaceId: routeSpaceId } = useParams<{ spaceId: string }>();
  const ownSpaceId = useAuthStore((s) => s.spaceId);

  const [space, setSpace] = useState<SpaceInfo | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwnSpace = ownSpaceId === routeSpaceId;

  useEffect(() => {
    if (!routeSpaceId) return;

    async function fetchSpaceAndZones() {
      setLoading(true);
      setError(null);
      try {
        const base = process.env.NEXT_PUBLIC_API_URL;

        const spaceRes = await fetch(`${base}/spaces/me`, {
          headers: getAuthHeaders(),
        });
        if (!spaceRes.ok) throw new Error(`Failed to load space (${spaceRes.status})`);
        setSpace(await spaceRes.json());

        const zonesRes = await fetch(`${base}/zones`, {
          headers: getAuthHeaders(),
        });
        if (!zonesRes.ok) {
          // Expected for PLATFORM_ADMIN — GET /zones is
          // SPACE_MANAGER/MEMBER only per the RBAC table.
          throw new Error(
            zonesRes.status === 403
              ? 'Zone details are not available to this role yet.'
              : `Failed to load zones (${zonesRes.status})`
          );
        }
        setZones(await zonesRes.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    if (isOwnSpace) {
      fetchSpaceAndZones();
    } else {
      setLoading(false);
      setError(
        'This backend has no endpoint for viewing another space\'s ' +
          'details — only your own. See PRD1.md\'s Target Users & Roles ' +
          'for Platform_Admin\'s current (limited) access.'
      );
    }
  }, [routeSpaceId, isOwnSpace]);

  if (loading) return <div>Loading space…</div>;
  if (error) return <div className="text-amber-700 bg-amber-50 border border-amber-300 rounded p-3 text-sm">{error}</div>;
  if (!space) return <div>Space not found.</div>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{space.name}</h1>
        <p className="text-xs text-slate-400">{space.slug}</p>
      </div>

      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-2">Zones</h2>
        {zones.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {zones.map((zone) => (
              <Link
                key={zone.id}
                href={`/dashboard/zones/${zone.id}`}
                className="border rounded p-4 bg-white shadow-sm hover:shadow-md transition"
              >
                {zone.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No zones in this space yet.</p>
        )}
      </section>
    </div>
  );
}
