'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
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

// Returns true if the current time is between startTime and endTime.
function isBookedNow(startTime: string, endTime: string): boolean {
  const now = Date.now();
  return new Date(startTime).getTime() <= now && new Date(endTime).getTime() >= now;
}

export default function FloorPlan({ zoneId, desks, rooms }: FloorPlanProps) {
  const liveBookings = useLiveBookingsStore((s) => s.bookings);
  const setInitial = useLiveBookingsStore((s) => s.setInitial);
  const role = useAuthStore((s) => s.role);
  const [loaded, setLoaded] = useState(false);

  // Only MEMBER can actually create a booking (see RBAC table in
  // ARCHITECTURE.md — POST /bookings is MEMBER-only). A SPACE_MANAGER
  // clicking a "Book" button would just get a 403, so the button only
  // renders for MEMBER rather than rendering-then-failing.
  const canBook = role === 'MEMBER';

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
                  className={`border rounded p-3 text-sm transition-colors flex flex-col gap-2 ${
                    booked
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-green-50 border-green-300 text-green-700'
                  }`}
                >
                  <div>
                    <div className="font-medium">{desk.name}</div>
                    <div className="text-xs">{booked ? 'Booked' : 'Available'}</div>
                  </div>
                  {canBook && !booked && (
                    <Link
                      href={`/dashboard/book/desk/${desk.id}`}
                      className="inline-flex items-center justify-center bg-slate-900 text-white
                                 rounded px-2 py-1 text-xs font-medium hover:bg-slate-800
                                 transition-colors"
                    >
                      Book
                    </Link>
                  )}
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
                  className={`border rounded p-3 text-sm transition-colors flex flex-col gap-2 ${
                    booked
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-green-50 border-green-300 text-green-700'
                  }`}
                >
                  <div>
                    <div className="font-medium">{room.name}</div>
                    <div className="text-xs">
                      {booked ? 'Booked' : 'Available'} · cap {room.capacity}
                    </div>
                  </div>
                  {canBook && !booked && (
                    <Link
                      href={`/dashboard/book/room/${room.id}`}
                      className="inline-flex items-center justify-center bg-slate-900 text-white
                                 rounded px-2 py-1 text-xs font-medium hover:bg-slate-800
                                 transition-colors"
                    >
                      Book
                    </Link>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
