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
  useLiveBookingsStore.setState({ bookings: [], lastResourceDeleted: null });
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

describe('liveBookingsStore — Stage 9 cancellation / deletion', () => {
  it('setInitial keeps cancelled bookings out of the live list', () => {
    useLiveBookingsStore.getState().setInitial([
      makeBooking({ id: 'ok' }),
      makeBooking({ id: 'gone', cancelledAt: '2026-08-20T09:30:00.000Z' }),
    ]);
    expect(useLiveBookingsStore.getState().bookings.map((b) => b.id)).toEqual(['ok']);
  });

  it('addBooking ignores a cancelled booking', () => {
    useLiveBookingsStore.getState().addBooking(makeBooking({ id: 'x', cancelledAt: '2026-08-20T09:30:00.000Z' }));
    expect(useLiveBookingsStore.getState().bookings).toHaveLength(0);
  });

  it('removeByResourceIds drops every booking of the deleted desks/rooms and nothing else', () => {
    useLiveBookingsStore.getState().setInitial([
      makeBooking({ id: 'a', bookableId: 'desk_1' }),
      makeBooking({ id: 'b', bookableId: 'desk_1' }),
      makeBooking({ id: 'c', bookableId: 'room_1', bookableType: 'ROOM' }),
      makeBooking({ id: 'd', bookableId: 'desk_2' }),
    ]);
    useLiveBookingsStore.getState().removeByResourceIds(['desk_1', 'room_1']);
    expect(useLiveBookingsStore.getState().bookings.map((b) => b.id)).toEqual(['d']);
  });

  it('noteResourceDeleted records the last deletion for pages to react to', () => {
    const ev = { type: 'ZONE' as const, id: 'z1', deskIds: ['d1'], roomIds: [] };
    useLiveBookingsStore.getState().noteResourceDeleted(ev);
    expect(useLiveBookingsStore.getState().lastResourceDeleted).toEqual(ev);
  });
});
