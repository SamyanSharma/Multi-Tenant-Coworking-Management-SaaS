import { describe, it, expect, beforeEach } from 'vitest';
import { useLiveBookingsStore, LiveBooking } from '../liveBookingsStore';

function makeBooking(overrides: Partial<LiveBooking> = {}): LiveBooking {
  return {
    id: 'booking_1',
    bookableType: 'DESK',
    bookableId: 'desk_1',
    userId: 'user_1',
    startTime: '2026-08-20T10:00:00.000Z',
    endTime: '2026-08-20T11:00:00.000Z',
    createdAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

// Reset the store between tests — Zustand stores are module-level
// singletons, so state persists across tests unless explicitly cleared.
beforeEach(() => {
  useLiveBookingsStore.setState({ bookings: [] });
});

describe('liveBookingsStore', () => {
  it('setInitial replaces the bookings list wholesale', () => {
    const seed = [makeBooking({ id: 'a' }), makeBooking({ id: 'b' })];
    useLiveBookingsStore.getState().setInitial(seed);
    expect(useLiveBookingsStore.getState().bookings).toHaveLength(2);
  });

  it('addBooking appends a new booking', () => {
    useLiveBookingsStore.getState().addBooking(makeBooking({ id: 'a' }));
    expect(useLiveBookingsStore.getState().bookings).toHaveLength(1);
  });

  it('addBooking ignores a duplicate id instead of appending it twice', () => {
    const booking = makeBooking({ id: 'dup_1' });
    useLiveBookingsStore.getState().addBooking(booking);
    useLiveBookingsStore.getState().addBooking(booking); // same id again

    const { bookings } = useLiveBookingsStore.getState();
    expect(bookings).toHaveLength(1);
  });

  it('addBooking allows different bookings with different ids', () => {
    useLiveBookingsStore.getState().addBooking(makeBooking({ id: 'a' }));
    useLiveBookingsStore.getState().addBooking(makeBooking({ id: 'b' }));

    expect(useLiveBookingsStore.getState().bookings).toHaveLength(2);
  });

  it('removeBooking removes only the matching id', () => {
    useLiveBookingsStore.getState().setInitial([
      makeBooking({ id: 'a' }),
      makeBooking({ id: 'b' }),
    ]);
    useLiveBookingsStore.getState().removeBooking('a');

    const { bookings } = useLiveBookingsStore.getState();
    expect(bookings).toHaveLength(1);
    expect(bookings[0].id).toBe('b');
  });

  it('removeBooking on a non-existent id is a no-op, not an error', () => {
    useLiveBookingsStore.getState().setInitial([makeBooking({ id: 'a' })]);
    expect(() => useLiveBookingsStore.getState().removeBooking('nonexistent')).not.toThrow();
    expect(useLiveBookingsStore.getState().bookings).toHaveLength(1);
  });
});
