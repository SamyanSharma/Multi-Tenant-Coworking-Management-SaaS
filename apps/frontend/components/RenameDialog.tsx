'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, X } from 'lucide-react';
import { getAuthHeaders } from '@/lib/api';

export type RenameKind = 'desk' | 'room' | 'zone';

const COLLECTION: Record<RenameKind, string> = { desk: 'desks', room: 'rooms', zone: 'zones' };

interface Props {
  kind: RenameKind;
  id: string;
  initialName: string;
  // Rooms can also change capacity here.
  initialCapacity?: number;
  onSaved: () => void;
  onClose: () => void;
}

// Renaming needs no confirmation: it's instantly reversible. Existing
// bookings keep the name they were made under (Booking.bookableName is a
// snapshot), so history stays truthful.
export default function RenameDialog({ kind, id, initialName, initialCapacity, onSaved, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [capacity, setCapacity] = useState(initialCapacity ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return setError('Name must be at least 2 characters');
    if (trimmed.length > 50) return setError('Name must be less than 50 characters');
    if (kind === 'room' && (!Number.isInteger(capacity) || capacity < 1)) {
      return setError('Capacity must be a whole number, 1 or more');
    }

    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: trimmed };
      if (kind === 'room') body.capacity = capacity;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/${COLLECTION[kind]}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const m = data?.message;
        throw new Error(Array.isArray(m) ? m.join(', ') : (m ?? `Could not save (${res.status})`));
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-dialog-title"
        data-testid="rename-dialog"
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-blue-600">
              <Pencil className="h-4 w-4" />
            </span>
            <h2 id="rename-dialog-title" className="text-base font-semibold text-slate-900">
              Edit {kind}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label htmlFor="rename-name" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Name
            </label>
            <input
              id="rename-name"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {kind === 'room' && (
            <div>
              <label htmlFor="rename-capacity" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Capacity
              </label>
              <input
                id="rename-capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
