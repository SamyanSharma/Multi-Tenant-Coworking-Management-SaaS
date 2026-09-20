'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DoorOpen,
  Monitor,
  Pencil,
  Trash2,
  Users,
  Armchair,
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useLiveBookingsStore } from '@/store/liveBookingsStore';
import {
  chunk,
  getResourceState,
  ResourceState,
  summarize,
} from '@/lib/floorPlan';

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

export type FloorPlanKind = 'desk' | 'room';

interface FloorPlanProps {
  zoneId: string;
  desks: Desk[];
  rooms: Room[];
  // Space Managers get rename / delete controls on every tile.
  canManage?: boolean;
  onRename?: (kind: FloorPlanKind, resource: { id: string; name: string; capacity?: number }) => void;
  onDelete?: (kind: FloorPlanKind, resource: { id: string; name: string }) => void;
}

const DESKS_PER_POD = 4;

function clock(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function statusText(s: ResourceState): { headline: string; detail: string } {
  if (s.state === 'occupied') {
    return {
      headline: 'Occupied',
      detail: s.until ? `until ${clock(s.until)}` : 'right now',
    };
  }
  return {
    headline: 'Available',
    detail: s.until ? `free until ${clock(s.until)}` : 'free for the rest of today',
  };
}

// Colour is never the only signal: every tile also spells the state out
// ("Occupied until 4:00 PM"), so the plan stays readable for colour-blind
// users.
const TONE = {
  available: {
    tile: 'border-emerald-300 bg-emerald-50/90 hover:border-emerald-400 hover:shadow-md',
    icon: 'bg-emerald-100 text-emerald-700',
    text: 'text-emerald-800',
    sub: 'text-emerald-700/80',
  },
  occupied: {
    tile: 'border-rose-300 bg-rose-50/90 hover:border-rose-400 hover:shadow-md',
    icon: 'bg-rose-100 text-rose-700',
    text: 'text-rose-800',
    sub: 'text-rose-700/80',
  },
} as const;

function StatusDot({ state }: { state: ResourceState['state'] }) {
  if (state === 'occupied') {
    return (
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
      </span>
    );
  }
  return <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />;
}

function ManageButtons({
  label,
  onRename,
  onDelete,
}: {
  label: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="absolute -right-2 -top-3 z-10 flex gap-1 opacity-0 transition-opacity
                 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
    >
      <button
        type="button"
        onClick={onRename}
        aria-label={`Rename ${label}`}
        title="Rename"
        className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-600
                   shadow-sm hover:bg-slate-50 hover:text-slate-900"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
        title="Delete"
        className="grid h-7 w-7 place-items-center rounded-full border border-red-200 bg-white text-red-600
                   shadow-sm hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function BookLink({ href, name }: { href: string; name: string }) {
  // Always shown to a MEMBER, whatever the state right now: a desk that is
  // occupied now can still be booked for a later time. The booking page's
  // availability-aware calendar (lib/availability.ts) is what prevents
  // overlaps; this tile only says "who is here right now".
  return (
    <Link
      href={href}
      aria-label={`Book ${name}`}
      className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-2 py-1.5
                 text-xs font-medium text-white transition-colors hover:bg-slate-700"
    >
      Book
    </Link>
  );
}

function DeskTile({
  desk,
  state,
  canBook,
  canManage,
  onRename,
  onDelete,
}: {
  desk: Desk;
  state: ResourceState;
  canBook: boolean;
  canManage: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const tone = TONE[state.state];
  const t = statusText(state);
  return (
    <div
      data-testid={`desk-${desk.id}`}
      data-state={state.state}
      className={`group relative rounded-xl border-2 p-3 transition-all ${tone.tile}`}
    >
      {canManage && (
        <ManageButtons label={`desk ${desk.name}`} onRename={onRename} onDelete={onDelete} />
      )}
      <div className="flex items-start gap-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone.icon}`}>
          <Monitor className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-semibold leading-tight text-slate-900" title={desk.name}>
            {desk.name}
          </p>
          <p className={`mt-1 flex items-center gap-1.5 text-[11px] font-medium ${tone.text}`}>
            <StatusDot state={state.state} />
            {t.headline}
          </p>
        </div>
      </div>
      <p className={`mt-2 text-[11px] ${tone.sub}`}>{t.detail}</p>
      {canBook && <BookLink href={`/dashboard/book/desk/${desk.id}`} name={desk.name} />}
    </div>
  );
}

function RoomBlock({
  room,
  state,
  canBook,
  canManage,
  onRename,
  onDelete,
}: {
  room: Room;
  state: ResourceState;
  canBook: boolean;
  canManage: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const tone = TONE[state.state];
  const t = statusText(state);
  const seats = Math.min(room.capacity, 12);
  return (
    <div
      data-testid={`room-${room.id}`}
      data-state={state.state}
      className={`group relative rounded-2xl border-2 p-4 transition-all ${tone.tile}`}
    >
      {canManage && (
        <ManageButtons label={`room ${room.name}`} onRename={onRename} onDelete={onDelete} />
      )}
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone.icon}`}>
          <DoorOpen className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-base font-semibold leading-tight text-slate-900" title={room.name}>
            {room.name}
          </p>
          <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
            <StatusDot state={state.state} />
            {t.headline}
          </p>
          <p className={`text-xs ${tone.sub}`}>{t.detail}</p>
        </div>
      </div>

      {/* Seats around the table: a quick visual read on room size. */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-wrap gap-1" aria-hidden="true">
          {Array.from({ length: seats }).map((_, i) => (
            <Armchair key={i} className={`h-3.5 w-3.5 ${tone.sub}`} />
          ))}
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] ${tone.sub}`}>
          <Users className="h-3 w-3" />
          {room.capacity} {room.capacity === 1 ? 'seat' : 'seats'}
        </span>
      </div>

      {canBook && <BookLink href={`/dashboard/book/room/${room.id}`} name={room.name} />}
    </div>
  );
}

function SectionLabel({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h3>
      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
        {count}
      </span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

export default function FloorPlan({
  zoneId,
  desks,
  rooms,
  canManage = false,
  onRename,
  onDelete,
}: FloorPlanProps) {
  const liveBookings = useLiveBookingsStore((s) => s.bookings);
  const setInitial = useLiveBookingsStore((s) => s.setInitial);
  const role = useAuthStore((s) => s.role);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Only MEMBER can actually create a booking (POST /bookings is
  // MEMBER-only — see the RBAC table in ARCHITECTURE.md), so a "Book"
  // button only renders for them rather than rendering and then failing.
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
  }, [setInitial]);

  // Tiles say "until 4:00 PM" and flip when a booking starts or ends, so
  // re-evaluate against the clock every 30 seconds even without a socket event.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const zoneDesks = useMemo(() => desks.filter((d) => d.zoneId === zoneId), [desks, zoneId]);
  const zoneRooms = useMemo(() => rooms.filter((r) => r.zoneId === zoneId), [rooms, zoneId]);

  const states = useMemo(() => {
    const map = new Map<string, ResourceState>();
    for (const r of [...zoneDesks, ...zoneRooms]) {
      map.set(r.id, getResourceState(liveBookings, r.id, now));
    }
    return map;
  }, [zoneDesks, zoneRooms, liveBookings, now]);

  const pods = useMemo(() => chunk(zoneDesks, DESKS_PER_POD), [zoneDesks]);
  const summary = summarize([...states.values()]);
  const availablePct = summary.total === 0 ? 0 : Math.round((summary.available / summary.total) * 100);

  if (!loaded) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading floor plan">
        <div className="h-5 w-56 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  const empty = zoneDesks.length === 0 && zoneRooms.length === 0;

  return (
    <div className="space-y-4">
      {/* Summary + legend */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 sm:w-72">
          <p className="text-sm font-semibold text-slate-900" data-testid="floor-summary">
            {summary.total === 0
              ? 'Nothing to book here yet'
              : `${summary.available} of ${summary.total} available now`}
          </p>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-rose-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={availablePct}
            aria-label="Share of desks and rooms available right now"
          >
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${availablePct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600" aria-label="Legend">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border-2 border-emerald-300 bg-emerald-50" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border-2 border-rose-300 bg-rose-50" />
            Occupied
          </span>
        </div>
      </div>

      {/* The "floor": a dotted grid canvas, rooms as larger blocks, desks in pods */}
      <div
        className="space-y-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-7"
        style={{
          backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        {empty && (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white/70 p-10 text-center">
            <p className="text-sm font-medium text-slate-700">This zone is empty</p>
            <p className="mt-1 text-xs text-slate-500">
              {canManage
                ? 'Open the Manage Zone tab to add desks and rooms.'
                : 'The space manager has not added any desks or rooms here yet.'}
            </p>
          </div>
        )}

        {zoneRooms.length > 0 && (
          <section aria-label="Meeting rooms">
            <SectionLabel count={zoneRooms.length}>Meeting rooms</SectionLabel>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {zoneRooms.map((room) => (
                <RoomBlock
                  key={room.id}
                  room={room}
                  state={states.get(room.id)!}
                  canBook={canBook}
                  canManage={canManage}
                  onRename={() => onRename?.('room', { id: room.id, name: room.name, capacity: room.capacity })}
                  onDelete={() => onDelete?.('room', { id: room.id, name: room.name })}
                />
              ))}
            </div>
          </section>
        )}

        {zoneDesks.length > 0 && (
          <section aria-label="Open desks">
            <SectionLabel count={zoneDesks.length}>Open desks</SectionLabel>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {pods.map((pod, i) => (
                <div
                  key={pod[0].id}
                  data-testid={`pod-${i}`}
                  className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm backdrop-blur-sm"
                >
                  <div className="grid grid-cols-2 gap-3">
                    {pod.map((desk) => (
                      <DeskTile
                        key={desk.id}
                        desk={desk}
                        state={states.get(desk.id)!}
                        canBook={canBook}
                        canManage={canManage}
                        onRename={() => onRename?.('desk', { id: desk.id, name: desk.name })}
                        onDelete={() => onDelete?.('desk', { id: desk.id, name: desk.name })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
