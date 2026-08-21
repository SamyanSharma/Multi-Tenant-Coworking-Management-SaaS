'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';

interface ZoneFormProps {
  initialName?: string;
  zoneId?: string; // present when editing, absent when creating
  onSuccess?: () => void;
}

export default function ZoneForm({ initialName = '', zoneId, onSuccess }: ZoneFormProps) {
  const spaceId = useAuthStore((s) => s.spaceId);
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(zoneId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!spaceId) {
      setError('No space assigned to this account — cannot create a zone.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(isEditing ? `${base}/zones/${zoneId}` : `${base}/zones`, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        // spaceId is NOT sent in the body — CreateZoneDto only accepts
        // `name`. The backend derives spaceId from the x-space-id header
        // (see TenantGuard), and forbidNonWhitelisted:true means sending
        // an extra `spaceId` field here would get the whole request
        // rejected with a 400, not just ignored.
        body: JSON.stringify({ name }),
      });

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
        Zone name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border rounded px-3 py-2"
          placeholder="e.g. 2nd Floor East Wing"
        />
      </label>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Create zone'}
      </button>
    </form>
  );
}
