'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

interface DeskFormProps {
  initialName?: string;
  deskId?: string;
  onSuccess?: () => void;
}

export default function DeskForm({ initialName = '', deskId, onSuccess }: DeskFormProps) {
  const { zoneId } = useParams<{ zoneId: string }>();
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(deskId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        isEditing ? `/api/desks/${deskId}` : '/api/desks',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          // zoneId comes from the route, not a form field — a desk
          // always belongs to the zone the user is currently viewing
          body: JSON.stringify({ name, zoneId }),
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
        Desk name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border rounded px-3 py-2"
          placeholder="e.g. Desk 12"
        />
      </label>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Add desk'}
      </button>
    </form>
  );
}
