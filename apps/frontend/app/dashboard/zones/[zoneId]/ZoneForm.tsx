'use client';

import { useState } from 'react';
import { getAuthHeaders } from '@/lib/api';

interface ZoneFormProps {
  zoneId: string;
  initialName: string;
  onSuccess: () => void;
}

export default function ZoneForm({
  zoneId,
  initialName,
  onSuccess,
}: ZoneFormProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError(null);
    setSaving(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/zones/${zoneId}`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          // IMPORTANT:
          // Do NOT send spaceId here.
          // The backend gets spaceId from the authenticated request.
          body: JSON.stringify({
            name: name.trim(),
          }),
        },
      );

      if (!res.ok) {
        let message = `Failed to update zone (${res.status})`;

        try {
          const data = await res.json();

          if (Array.isArray(data?.message)) {
            message = data.message.join(', ');
          } else if (typeof data?.message === 'string') {
            message = data.message;
          }
        } catch {
          // Keep the default error message.
        }

        throw new Error(message);
      }

      const updatedZone = await res.json();

      setName(updatedZone.name ?? name.trim());
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update zone',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 max-w-md"
    >
      <div>
        <label
          htmlFor="zone-name"
          className="block text-sm text-slate-500 mb-1"
        >
          Zone name
        </label>

        <input
          id="zone-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Floor"
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      {error && (
        <div className="text-red-600 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="bg-slate-900 text-white rounded px-3 py-2 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  );
}