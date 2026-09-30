'use client';

import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from '@/lib/api';

interface ZoneStatusToggleProps {
  zoneId: string;
  isActive: boolean;
  onChanged: () => void;
}

// Saves immediately on click (a switch, not a form). The parent should key
// this component on `isActive` so it re-syncs after the page refetches.
export default function ZoneStatusToggle({
  zoneId,
  isActive,
  onChanged,
}: ZoneStatusToggleProps) {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = confirmed ?? isActive;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/zones/${zoneId}`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isActive: !shown }),
        },
      );
      if (!res.ok) {
        throw new Error(`Failed to update zone status (${res.status})`);
      }
      const updated = await res.json();
      setConfirmed(updated.isActive);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update zone status');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {shown ? 'Zone is active' : 'Zone is inactive'}
          </p>
          <p className="text-xs text-slate-500">
            {shown
              ? 'Members can see this zone.'
              : 'Marked inactive. It is kept, and can be switched back on at any time.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={shown}
          aria-label="Zone active"
          onClick={toggle}
          disabled={busy}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            shown ? 'bg-green-600' : 'bg-slate-300'
          }`}
        >
          {busy ? (
            <Loader2 className="absolute left-1/2 -translate-x-1/2 w-4 h-4 animate-spin text-white" />
          ) : (
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                shown ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          )}
        </button>
      </div>
      {error && (
        <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
