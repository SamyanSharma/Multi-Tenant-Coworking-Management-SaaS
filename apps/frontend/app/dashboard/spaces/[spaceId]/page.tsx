'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/api';

interface Zone {
  id: string;
  name: string;
}
interface SpaceDetail {
  id: string;
  name: string;
  slug: string;
  zones: Zone[];
}

export default function SpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [space, setSpace] = useState<SpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId) return;

    async function fetchSpace() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/spaces/${spaceId}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`Failed to load space (${res.status})`);
        const data: SpaceDetail = await res.json();
        setSpace(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchSpace();
  }, [spaceId]);

  if (loading) return <div>Loading space…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!space) return <div>Space not found.</div>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{space.name}</h1>
        <p className="text-xs text-slate-400">{space.slug}</p>
      </div>

      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-2">Zones</h2>
        {space.zones?.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {space.zones.map((zone) => (
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
