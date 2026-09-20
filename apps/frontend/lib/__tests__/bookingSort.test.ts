import { describe, it, expect } from 'vitest';
import { getBookingStatus, sortBookings } from '../bookingSort';

const NOW = new Date('2026-09-17T12:00:00.000Z');

function booking(startTime: string, endTime: string) {
  return { startTime, endTime };
}

describe('getBookingStatus', () => {
  it('is completed when endTime is in the past', () => {
    const b = booking('2026-09-15T09:00:00.000Z', '2026-09-15T10:00:00.000Z');
    expect(getBookingStatus(b, NOW)).toBe('completed');
  });

  it('is active when now falls between startTime and endTime', () => {
    const b = booking('2026-09-17T11:00:00.000Z', '2026-09-17T13:00:00.000Z');
    expect(getBookingStatus(b, NOW)).toBe('active');
  });

  it('is upcoming when startTime is in the future', () => {
    const b = booking('2026-09-18T09:00:00.000Z', '2026-09-18T10:00:00.000Z');
    expect(getBookingStatus(b, NOW)).toBe('upcoming');
  });

  it('treats the exact boundary instants as active (inclusive)', () => {
    const b = booking('2026-09-17T12:00:00.000Z', '2026-09-17T12:00:00.000Z');
    expect(getBookingStatus(b, NOW)).toBe('active');
  });
});

describe('sortBookings', () => {
  it('puts active bookings before upcoming and completed', () => {
    const active = booking('2026-09-17T11:00:00.000Z', '2026-09-17T13:00:00.000Z');
    const upcoming = booking('2026-09-18T09:00:00.000Z', '2026-09-18T10:00:00.000Z');
    const completed = booking('2026-09-10T09:00:00.000Z', '2026-09-10T10:00:00.000Z');

    const result = sortBookings([completed, upcoming, active], NOW);

    expect(result[0]).toBe(active);
  });

  it('orders upcoming bookings soonest-first (a queue)', () => {
    const soon = booking('2026-09-18T09:00:00.000Z', '2026-09-18T10:00:00.000Z');
    const later = booking('2026-09-25T09:00:00.000Z', '2026-09-25T10:00:00.000Z');
    const evenLater = booking('2026-10-01T09:00:00.000Z', '2026-10-01T10:00:00.000Z');

    const result = sortBookings([evenLater, soon, later], NOW);

    expect(result).toEqual([soon, later, evenLater]);
  });

  it('orders completed bookings most-recent-first (a stack)', () => {
    const yesterday = booking('2026-09-16T09:00:00.000Z', '2026-09-16T10:00:00.000Z');
    const lastWeek = booking('2026-09-10T09:00:00.000Z', '2026-09-10T10:00:00.000Z');
    const lastMonth = booking('2026-08-15T09:00:00.000Z', '2026-08-15T10:00:00.000Z');

    const result = sortBookings([lastMonth, yesterday, lastWeek], NOW);

    expect(result).toEqual([yesterday, lastWeek, lastMonth]);
  });

  it('produces the full active -> upcoming -> completed grouping, each internally ordered correctly', () => {
    const active = booking('2026-09-17T11:00:00.000Z', '2026-09-17T13:00:00.000Z');
    const soonUpcoming = booking('2026-09-18T09:00:00.000Z', '2026-09-18T10:00:00.000Z');
    const laterUpcoming = booking('2026-09-25T09:00:00.000Z', '2026-09-25T10:00:00.000Z');
    const recentCompleted = booking('2026-09-16T09:00:00.000Z', '2026-09-16T10:00:00.000Z');
    const oldCompleted = booking('2026-08-15T09:00:00.000Z', '2026-08-15T10:00:00.000Z');

    // Deliberately shuffled input, matching the real-world bug report
    // (bookings came back from the API in no meaningful order at all).
    const result = sortBookings(
      [oldCompleted, laterUpcoming, active, recentCompleted, soonUpcoming],
      NOW,
    );

    expect(result).toEqual([
      active,
      soonUpcoming,
      laterUpcoming,
      recentCompleted,
      oldCompleted,
    ]);
  });

  it('does not mutate the original array', () => {
    const list = [
      booking('2026-09-25T09:00:00.000Z', '2026-09-25T10:00:00.000Z'),
      booking('2026-09-18T09:00:00.000Z', '2026-09-18T10:00:00.000Z'),
    ];
    const original = [...list];

    sortBookings(list, NOW);

    expect(list).toEqual(original);
  });
});

describe('cancelled bookings (Stage 9)', () => {
  it('is cancelled whatever the dates say', () => {
    const upcoming = { startTime: '2026-09-18T09:00:00.000Z', endTime: '2026-09-18T10:00:00.000Z', cancelledAt: '2026-09-17T08:00:00.000Z' };
    const active = { startTime: '2026-09-17T11:00:00.000Z', endTime: '2026-09-17T13:00:00.000Z', cancelledAt: '2026-09-17T08:00:00.000Z' };
    expect(getBookingStatus(upcoming, NOW)).toBe('cancelled');
    expect(getBookingStatus(active, NOW)).toBe('cancelled');
  });

  it('a null cancelledAt does not cancel', () => {
    const b = { startTime: '2026-09-18T09:00:00.000Z', endTime: '2026-09-18T10:00:00.000Z', cancelledAt: null };
    expect(getBookingStatus(b, NOW)).toBe('upcoming');
  });

  it('sorts cancelled last, most recent first', () => {
    const list = [
      { id: 'c-old', startTime: '2026-09-10T09:00:00.000Z', endTime: '2026-09-10T10:00:00.000Z', cancelledAt: 'x' },
      { id: 'done', startTime: '2026-09-15T09:00:00.000Z', endTime: '2026-09-15T10:00:00.000Z' },
      { id: 'c-new', startTime: '2026-09-19T09:00:00.000Z', endTime: '2026-09-19T10:00:00.000Z', cancelledAt: 'x' },
      { id: 'soon', startTime: '2026-09-18T09:00:00.000Z', endTime: '2026-09-18T10:00:00.000Z' },
    ];
    expect(sortBookings(list, NOW).map((b) => b.id)).toEqual(['soon', 'done', 'c-new', 'c-old']);
  });
});
