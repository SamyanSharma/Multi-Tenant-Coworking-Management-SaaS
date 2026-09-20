import { describe, it, expect } from 'vitest';
import { getResourceState, summarize, chunk } from '../floorPlan';

// Local-time constructors so "same calendar day" behaves the same in any timezone.
const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(2026, 8, 20 + dayOffset, h, m, 0, 0);
const iso = (d: Date) => d.toISOString();
const bk = (id: string, start: Date, end: Date, extra = {}) => ({
  bookableId: id,
  startTime: iso(start),
  endTime: iso(end),
  ...extra,
});
const NOW = at(12, 0);

describe('getResourceState', () => {
  it('is available with no end when there are no bookings', () => {
    expect(getResourceState([], 'd1', NOW)).toEqual({ state: 'available', until: null });
  });

  it('is occupied until the end of the booking that covers now', () => {
    const r = getResourceState([bk('d1', at(11), at(14))], 'd1', NOW);
    expect(r.state).toBe('occupied');
    expect(r.until).toEqual(at(14));
  });

  it('merges back-to-back bookings into one continuous occupation', () => {
    const r = getResourceState(
      [bk('d1', at(11), at(13)), bk('d1', at(13), at(15)), bk('d1', at(15), at(16))],
      'd1',
      NOW,
    );
    expect(r).toEqual({ state: 'occupied', until: at(16) });
  });

  it('does not merge across a gap', () => {
    const r = getResourceState(
      [bk('d1', at(11), at(13)), bk('d1', at(14), at(15))],
      'd1',
      NOW,
    );
    expect(r).toEqual({ state: 'occupied', until: at(13) });
  });

  it('is available until the next booking later today', () => {
    const r = getResourceState([bk('d1', at(15), at(16))], 'd1', NOW);
    expect(r).toEqual({ state: 'available', until: at(15) });
  });

  it('a booking tomorrow does not limit today (free all day)', () => {
    const r = getResourceState([bk('d1', at(9, 0, 1), at(10, 0, 1))], 'd1', NOW);
    expect(r).toEqual({ state: 'available', until: null });
  });

  it('ignores past bookings and other resources', () => {
    const r = getResourceState(
      [bk('d1', at(8), at(9)), bk('d2', at(11), at(14))],
      'd1',
      NOW,
    );
    expect(r).toEqual({ state: 'available', until: null });
  });

  it('a booking that ends exactly now no longer occupies the resource', () => {
    const r = getResourceState([bk('d1', at(11), at(12))], 'd1', NOW);
    expect(r.state).toBe('available');
  });

  it('ignores cancelled bookings (a refunded booking must not show as occupied)', () => {
    const r = getResourceState(
      [bk('d1', at(11), at(14), { cancelledAt: iso(at(10)) })],
      'd1',
      NOW,
    );
    expect(r).toEqual({ state: 'available', until: null });
  });
});

describe('summarize / chunk', () => {
  it('counts available vs occupied', () => {
    expect(
      summarize([
        { state: 'occupied', until: null },
        { state: 'available', until: null },
        { state: 'available', until: null },
      ]),
    ).toEqual({ total: 3, occupied: 1, available: 2 });
  });

  it('chunks desks into pods and keeps the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 4)).toEqual([[1, 2, 3, 4], [5, 6, 7]]);
    expect(chunk([], 4)).toEqual([]);
  });

  it('rejects a non-positive size instead of looping forever', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});
