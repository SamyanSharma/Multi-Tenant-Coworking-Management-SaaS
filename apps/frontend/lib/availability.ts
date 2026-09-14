export interface BookingInterval {
  start: Date;
  end: Date;
}

// Same overlap test as Postgres's tsrange && operator, which backs
// the backend's no_overlapping_bookings exclusion constraint
// (bookings.service.ts) — two ranges overlap iff each starts before
// the other ends. Keeping this identical to the DB's own definition
// means the frontend can never show a slot as "available" that the
// backend would then reject.
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function isRangeOccupied(
  start: Date,
  end: Date,
  occupied: BookingInterval[],
): boolean {
  return occupied.some((iv) =>
    intervalsOverlap(start, end, iv.start, iv.end),
  );
}

// Whether every minute of the given calendar day is covered by some
// existing booking, i.e. there is no possible start time left on this
// day that wouldn't immediately overlap something. Ignores
// past-vs-future entirely — that's handled separately (DateCalendar's
// own minDate/floor) — this is purely "is this day structurally full."
export function isDayFullyOccupied(
  date: Date,
  occupied: BookingInterval[],
): boolean {
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const dayEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    0,
    0,
  );

  // Clip every occupied interval to this day's window, merge them,
  // and check whether the merged coverage spans the entire day.
  const clipped = occupied
    .map((iv) => ({
      start: iv.start < dayStart ? dayStart : iv.start,
      end: iv.end > dayEnd ? dayEnd : iv.end,
    }))
    .filter((iv) => iv.start < iv.end) // drop intervals with no overlap with this day at all
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (clipped.length === 0) return false;

  let coveredUntil = dayStart;
  for (const iv of clipped) {
    if (iv.start.getTime() > coveredUntil.getTime()) {
      // Gap found before this interval starts — the day isn't fully
      // booked.
      return false;
    }
    if (iv.end.getTime() > coveredUntil.getTime()) {
      coveredUntil = iv.end;
    }
  }

  return coveredUntil.getTime() >= dayEnd.getTime();
}
