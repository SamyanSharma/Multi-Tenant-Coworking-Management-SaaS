'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAuthHeaders } from '@/lib/api';
import { useLiveBookingsStore } from '@/store/liveBookingsStore';

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

interface FloorPlanProps {
  zoneId: string;
  desks: Desk[];
  rooms: Room[];
}

// "Currently booked" = any live booking on this resource whose time
// range includes right now. This is intentionally simple (a real
// calendar view of future/past slots is a bigger feature than "is this
// desk taken right now") — matches the task brief's "Live updating
// component" framing: instant visual feedback, not a full scheduler UI.
function isBookedNow(startTime: string, endTime: string): boolean {
  const now = Date.now();
  return new Date(startTime).getTime() <= now && new Date(endTime).getTime() >= now;
}

export default function FloorPlan({ zoneId, desks, rooms }: FloorPlanProps) {
  const liveBookings = useLiveBookingsStore((s) => s.bookings);
  const setInitial = useLiveBookingsStore((s) => s.setInitial);
  const [loaded, setLoaded] = useState(false);

  // Seed the store with whatever's already booked when this component
  // first mounts — the socket only tells us about NEW bookings from this
  // point forward, so without this seed step, a desk booked five minutes
  // before you opened the page would incorrectly show as free.
  useEffect(() => {
    async function seedInitialBookings() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bookings`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          setInitial(await res.json());
        }
      } finally {
        setLoaded(true);
      }
    }
    seedInitialBookings();
    // Only seed once per mount — after this, updates come from the
    // socket (via dashboard/layout.tsx's listeners), not repeated fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bookedResourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of liveBookings) {
      if (isBookedNow(b.startTime, b.endTime)) ids.add(b.bookableId);
    }
    return ids;
  }, [liveBookings]);

  if (!loaded) return <div className="text-sm text-slate-500">Loading floor plan…</div>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-xs font-medium text-slate-500 mb-2">Desks</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {desks
            .filter((d) => d.zoneId === zoneId)
            .map((desk) => {
              const booked = bookedResourceIds.has(desk.id);
              return (
                <div
                  key={desk.id}
                  className={`border rounded p-3 text-sm transition-colors ${
                    booked
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-green-50 border-green-300 text-green-700'
                  }`}
                >
                  <div className="font-medium">{desk.name}</div>
                  <div className="text-xs">{booked ? 'Booked' : 'Available'}</div>
                </div>
              );
            })}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-medium text-slate-500 mb-2">Rooms</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {rooms
            .filter((r) => r.zoneId === zoneId)
            .map((room) => {
              const booked = bookedResourceIds.has(room.id);
              return (
                <div
                  key={room.id}
                  className={`border rounded p-3 text-sm transition-colors ${
                    booked
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-green-50 border-green-300 text-green-700'
                  }`}
                >
                  <div className="font-medium">{room.name}</div>
                  <div className="text-xs">
                    {booked ? 'Booked' : 'Available'} · cap {room.capacity}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
