import { describe, it, expect } from 'vitest';
import {
  toChartSeries,
  toTypeSplit,
  hasRevenue,
  hasBookings,
  hasTypeSplit,
} from '../analyticsTrends';

describe('analyticsTrends helpers', () => {
  it('converts cents to dollars and labels each UTC day', () => {
    const out = toChartSeries([
      { date: '2026-09-05', bookings: 2, revenueCents: 12550 },
      { date: '2026-10-01', bookings: 0, revenueCents: 0 },
    ]);

    expect(out[0]).toEqual({ date: '2026-09-05', label: 'Sep 5', bookings: 2, revenue: 125.5 });
    expect(out[1].label).toBe('Oct 1');
  });

  it('keeps the order it was given (server sends oldest first)', () => {
    const out = toChartSeries([
      { date: '2026-09-01', bookings: 1, revenueCents: 0 },
      { date: '2026-09-02', bookings: 2, revenueCents: 0 },
    ]);
    expect(out.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('builds the desk/room split in a fixed order', () => {
    expect(toTypeSplit({ desk: 3, room: 1 })).toEqual([
      { name: 'Desks', value: 3 },
      { name: 'Rooms', value: 1 },
    ]);
  });

  it('detects empty data so the UI can say so instead of drawing a flat chart', () => {
    const empty = [{ date: '2026-09-01', bookings: 0, revenueCents: 0 }];
    const busy = [{ date: '2026-09-01', bookings: 1, revenueCents: 500 }];

    expect(hasRevenue(empty)).toBe(false);
    expect(hasRevenue(busy)).toBe(true);
    expect(hasBookings(empty)).toBe(false);
    expect(hasBookings(busy)).toBe(true);
    expect(hasTypeSplit({ desk: 0, room: 0 })).toBe(false);
    expect(hasTypeSplit({ desk: 0, room: 2 })).toBe(true);
  });
});
