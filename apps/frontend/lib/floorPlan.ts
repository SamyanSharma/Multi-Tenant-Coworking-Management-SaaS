export interface FloorBooking {
  bookableId: string;
  startTime: string;
  endTime: string;
  cancelledAt?: string | null;
}

export interface ResourceState {
  state: 'occupied' | 'available';
  // occupied  -> when the current (possibly back-to-back) use ends
  // available -> when the next booking starts later today, or null if free
  //              for the rest of today
  until: Date | null;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// What should a desk/room tile say right now?  Uses only the bookings
// already in the live store, so it updates the instant a booking_created /
// booking_cancelled / resource_deleted event arrives.
//
// Back-to-back bookings (one ends exactly when the next starts) are treated
// as one continuous occupation, so a tile says "Occupied until 15:00" rather
// than "until 14:00" followed by a confusing flip to "free" for zero seconds.
export function getResourceState(
  bookings: FloorBooking[],
  resourceId: string,
  now: Date = new Date(),
): ResourceState {
  const mine = bookings
    .filter((b) => b.bookableId === resourceId && !b.cancelledAt)
    .map((b) => ({ start: new Date(b.startTime), end: new Date(b.endTime) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const current = mine.find((b) => b.start <= now && b.end > now);

  if (current) {
    let until = current.end;
    for (const next of mine) {
      if (next.start.getTime() <= until.getTime() && next.end > until) {
        until = next.end;
      }
    }
    return { state: 'occupied', until };
  }

  const next = mine.find((b) => b.start > now);
  if (next && sameCalendarDay(next.start, now)) {
    return { state: 'available', until: next.start };
  }
  return { state: 'available', until: null };
}

export interface FloorSummary {
  total: number;
  available: number;
  occupied: number;
}

export function summarize(states: ResourceState[]): FloorSummary {
  const occupied = states.filter((s) => s.state === 'occupied').length;
  return {
    total: states.length,
    occupied,
    available: states.length - occupied,
  };
}

// Group desks into small "pods" so the floor plan reads like a real office
// layout (clusters of desks) instead of one endless grid.
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
