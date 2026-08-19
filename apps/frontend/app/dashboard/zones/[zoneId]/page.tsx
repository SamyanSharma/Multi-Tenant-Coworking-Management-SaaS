'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';
import ZoneForm from './ZoneForm';
import DeskForm from './DeskForm';
import RoomForm from './RoomForm';
import FloorPlan from '@/components/FloorPlan';

interface Desk {
  id: string;
  name: string;
  zoneId: string;
}
interface Room {
  id: string;
  name: string;
  capacity: number;
  zoneId: string;
}
interface ZoneDetail {
  id: string;
  name: string;
}

export default function ZoneDetailPage() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const role = useAuthStore((s) => s.role);
  const [zone, setZone] = useState<ZoneDetail | null>(null);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!zoneId) return;

    async function fetchZone() {
      setLoading(true);
      setError(null);
      try {
        const base = process.env.NEXT_PUBLIC_API_URL;

        // GET /zones/:id returns a bare zone object — {id, name, spaceId,
        // ...} — with NO nested desks/rooms. GET /desks and GET /rooms
        // are both space-wide (not filterable by zoneId server-side), so
        // we fetch all of them for the space and filter client-side by
        // zoneId. Not ideal at scale, but matches what the backend
        // actually offers right now — no query-param filtering exists.
        const [zoneRes, desksRes, roomsRes] = await Promise.all([
          fetch(`${base}/zones/${zoneId}`, { headers: getAuthHeaders() }),
          fetch(`${base}/desks`, { headers: getAuthHeaders() }),
          fetch(`${base}/rooms`, { headers: getAuthHeaders() }),
        ]);

        if (!zoneRes.ok) throw new Error(`Failed to load zone (${zoneRes.status})`);
        if (!desksRes.ok) throw new Error(`Failed to load desks (${desksRes.status})`);
        if (!roomsRes.ok) throw new Error(`Failed to load rooms (${roomsRes.status})`);

        const zoneData: ZoneDetail = await zoneRes.json();
        const allDesks: Desk[] = await desksRes.json();
        const allRooms: Room[] = await roomsRes.json();

        setZone(zoneData);
        setDesks(allDesks.filter((d) => d.zoneId === zoneId));
        setRooms(allRooms.filter((r) => r.zoneId === zoneId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchZone();
  }, [zoneId, refreshKey]);

  if (loading) return <div>Loading zone…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!zone) return <div>Zone not found.</div>;

  const canManage = role === 'SPACE_MANAGER' || role === 'PLATFORM_ADMIN';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{zone.name}</h1>

      <FloorPlan zoneId={zone.id} desks={desks} rooms={rooms} />

      {canManage && (
        <section className="flex flex-col gap-6 border-t pt-6 mt-2">
          <div>
            <h2 className="text-sm font-medium text-slate-500 mb-2">Add a desk</h2>
            <DeskForm onSuccess={() => setRefreshKey((k) => k + 1)} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-slate-500 mb-2">Add a room</h2>
            <RoomForm onSuccess={() => setRefreshKey((k) => k + 1)} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-slate-500 mb-2">Edit this zone</h2>
            <ZoneForm
              zoneId={zone.id}
              initialName={zone.name}
              onSuccess={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
