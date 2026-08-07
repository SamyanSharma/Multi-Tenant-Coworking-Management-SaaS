'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

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
  const token = useAuthStore((s) => s.token);
  const [zone, setZone] = useState<ZoneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!zoneId) return;

    async function fetchZone() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/zones/${zoneId}`, {
          headers: { Authorization: `Bearer ${token}` },
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
  }, [zoneId, token]);

  if (loading) return <div>Loading zone…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!zone) return <div>Zone not found.</div>;

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
    </div>
  );
}
