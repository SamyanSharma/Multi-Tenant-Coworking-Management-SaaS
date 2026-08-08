'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBookingStore, BookableType } from '@/store/bookingStore';

export default function BookResourcePage() {
  const { bookableType, bookableId } = useParams<{ bookableType: string; bookableId: string }>();
  const router = useRouter();

  const setDraftResource = useBookingStore((s) => s.setDraftResource);
  const setDraftTimes = useBookingStore((s) => s.setDraftTimes);
  const submitBooking = useBookingStore((s) => s.submitBooking);
  const isSubmitting = useBookingStore((s) => s.isSubmitting);
  const error = useBookingStore((s) => s.error);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [conflict, setConflict] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConflict(false);

    setDraftResource(bookableType.toUpperCase() as BookableType, bookableId);
    setDraftTimes(new Date(start).toISOString(), new Date(end).toISOString());

    const success = await submitBooking();

    if (success) {
      router.push('/dashboard/bookings');
    } else {
      setConflict(true);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
      <h1 className="text-lg font-semibold">Book this {bookableType}</h1>

      <label className="flex flex-col gap-1 text-sm">
        Start time
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
          className="border rounded px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        End time
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
          className="border rounded px-3 py-2"
        />
      </label>

      {conflict && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded p-3">
          That slot was just taken — {error ?? 'please pick a different time.'}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {isSubmitting ? 'Booking…' : 'Confirm booking'}
      </button>
    </form>
  );
}
