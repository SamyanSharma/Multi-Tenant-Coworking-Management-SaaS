'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

interface RoomFormProps {
  initialName?: string;
  initialCapacity?: number;
  roomId?: string;
  onSuccess?: () => void;
}

export default function RoomForm({
  initialName = '',
  initialCapacity = 1,
  roomId,
  onSuccess,
}: RoomFormProps) {
  const { zoneId } = useParams<{ zoneId: string }>();
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState(initialName);
  const [capacity, setCapacity] = useState(initialCapacity);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(roomId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (capacity < 1) {
      setError('Capacity must be at least 1.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        isEditing ? `/api/rooms/${roomId}` : '/api/rooms',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name, capacity, zoneId }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        Room name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border rounded px-3 py-2"
          placeholder="e.g. Conference Room A"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Capacity
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
          required
          className="border rounded px-3 py-2"
        />
      </label>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Add room'}
      </button>
    </form>
  );
}
