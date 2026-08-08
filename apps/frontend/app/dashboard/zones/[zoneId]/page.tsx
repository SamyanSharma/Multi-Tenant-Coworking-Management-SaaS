'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';
import ZoneForm from './ZoneForm';
import DeskForm from './DeskForm';
import RoomForm from './RoomForm';

interface Desk {
  id: string;
  name: string;
}
interface Room {
  id: string;
  name: string;
  capacity: number;
}
interface ZoneDetail {
  id: string;
  name: string;
  desks: Desk[];
  rooms: Room[];
}

export default function ZoneDetailPage() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const role = useAuthStore((s) => s.role);
  const [zone, setZone] = useState<ZoneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!zoneId) return;

    async function fetchZone() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/zones/${zoneId}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`Failed to load zone (${res.status})`);
        const data: ZoneDetail = await res.json();
        setZone(data);
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

      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-2">Desks</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {zone.desks.map((desk) => (
            <div key={desk.id} className="border rounded p-3 bg-white shadow-sm">
              {desk.name}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-2">Rooms</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {zone.rooms.map((room) => (
            <div key={room.id} className="border rounded p-3 bg-white shadow-sm">
              {room.name} <span className="text-xs text-slate-400">(cap {room.capacity})</span>
            </div>
          ))}
        </div>
      </section>

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
