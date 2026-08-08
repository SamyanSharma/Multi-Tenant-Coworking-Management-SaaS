'use client';

import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/api';

interface Booking {
  id: string;
  bookableType: 'DESK' | 'ROOM';
  bookableId: string;
  startTime: string;
  endTime: string;
}

// Scoping: Members should see only their own bookings, Space_Managers
// their space's bookings. Assumed server-side via x-space-id/x-user-role
// headers — confirm the actual scoping rule with Arpit.
export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBookings() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bookings`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`Failed to load bookings (${res.status})`);
        const data: Booking[] = await res.json();
        setBookings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchBookings();
  }, []);

  if (loading) return <div>Loading bookings…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Bookings</h1>
      {bookings.length === 0 ? (
        <p className="text-sm text-slate-500">No bookings yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {bookings.map((b) => (
            <div key={b.id} className="border rounded p-3 bg-white shadow-sm text-sm">
              <span className="font-medium">
                {b.bookableType === 'DESK' ? 'Desk' : 'Room'} {b.bookableId}
              </span>
              <span className="text-slate-500">
                {' — '}
                {new Date(b.startTime).toLocaleString()} to{' '}
                {new Date(b.endTime).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
