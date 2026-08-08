'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/api';

interface Zone {
  id: string;
  name: string;
}

// Lists zones within the manager's own space — scoping is expected to
// happen server-side via the x-space-id header (see lib/api.ts), not
// filtered client-side. Confirm with Arpit that GET /zones returns only
// the caller's own space when x-space-id is set, rather than all zones.
export default function ZonesListPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchZones() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/zones`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`Failed to load zones (${res.status})`);
        const data: Zone[] = await res.json();
        setZones(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchZones();
  }, []);

  if (loading) return <div>Loading zones…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Zones</h1>
      {zones.length === 0 ? (
        <p className="text-sm text-slate-500">No zones yet.</p>
      ) : (
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
      )}
    </div>
  );
}
