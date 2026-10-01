export interface BookingLike {
  startTime: string;
  endTime: string;
  // Stage 9: set when the booking was cancelled because the space removed
  // its desk/room (the customer is refunded if they had paid).
  cancelledAt?: string | null;
}

export type BookingStatus = 'active' | 'upcoming' | 'completed' | 'cancelled';

export function getBookingStatus(
  booking: BookingLike,
  now: Date = new Date(),
): BookingStatus {
  // A cancelled booking is neither upcoming nor active, whatever its dates.
  if (booking.cancelledAt) return 'cancelled';

  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);

  if (end < now) return 'completed';
  if (start <= now && end >= now) return 'active';
  return 'upcoming';
}

// Booking lists across mature SaaS products (Calendly, Airbnb Trips,
// OpenTable, Google Calendar's own list view) consistently use this
// same shape rather than one flat chronological sort in either
// direction: what's happening right now surfaces first (most
// actionable), what's coming up next is a queue — soonest first, so
// "what do I need to know about next" reads top-down — and what's
// already over becomes a stack — most recent first, since a booking
// from yesterday is more likely to matter than one from three weeks
// ago. A single global sort (oldest/newest first) would bury
// "happening now" arbitrarily among a wall of dates.
const STATUS_GROUP_ORDER: Record<BookingStatus, number> = {
  active: 0,
  upcoming: 1,
  completed: 2,
  cancelled: 3,
};

export function sortBookings<T extends BookingLike>(
  list: T[],
  now: Date = new Date(),
): T[] {
  return [...list].sort((a, b) => {
    const statusA = getBookingStatus(a, now);
    const statusB = getBookingStatus(b, now);

    if (statusA !== statusB) {
      return STATUS_GROUP_ORDER[statusA] - STATUS_GROUP_ORDER[statusB];
    }

    const startA = new Date(a.startTime).getTime();
    const startB = new Date(b.startTime).getTime();

    // Upcoming: queue — soonest starts first.
    // Completed: stack — most recently ended first.
    // Active: start time doesn't matter much among a small set
    // that's already sharing the "happening now" group; soonest-
    // started (longest-running) first is a reasonable tiebreak.
    // Cancelled: like completed, most recent first.
    return statusA === 'completed' || statusA === 'cancelled'
      ? startB - startA
      : startA - startB;
  });
}
