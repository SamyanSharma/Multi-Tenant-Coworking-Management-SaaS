import { describe, it, expect } from 'vitest';
import {
  toAdminChartSeries,
  topSpacesByRevenue,
  shortName,
  hasAdminRevenue,
  hasAdminBookings,
  hasAnySpaces,
  type AdminTrends,
} from '../adminTrends';
import type { SpaceRow } from '../adminOverview';

const trends: AdminTrends = {
  days: 3,
  baseline: { spaces: 4, members: 10 },
  series: [
    { date: '2026-09-28', netCents: 0, paidBookings: 0, newSpaces: 1, newMembers: 2 },
    { date: '2026-09-29', netCents: 12550, paidBookings: 3, newSpaces: 0, newMembers: 0 },
    { date: '2026-09-30', netCents: 0, paidBookings: 0, newSpaces: 2, newMembers: 1 },
  ],
};

const space = (name: string, netCents30d: number): SpaceRow => ({
  id: name, name, slug: name, status: 'ACTIVE', createdAt: '2026-01-01',
  members: 0, desks: 0, rooms: 0, netCents: netCents30d, netCents30d, bookings30d: 0,
});

describe('toAdminChartSeries', () => {
  it('turns new-per-day into running totals that start from the baseline', () => {
    const out = toAdminChartSeries(trends);

    expect(out.map((p) => p.spaces)).toEqual([5, 5, 7]);
    expect(out.map((p) => p.members)).toEqual([12, 12, 13]);
  });

  it('converts cents to dollars and labels each UTC day', () => {
    const out = toAdminChartSeries(trends);

    expect(out[1]).toMatchObject({ label: 'Sep 29', revenue: 125.5, paidBookings: 3 });
  });
});

describe('topSpacesByRevenue', () => {
  it('ranks by trailing-30-day net revenue, drops zero-revenue spaces, and caps the list', () => {
    const list = [space('A', 100), space('B', 900), space('C', 0), space('D', 500), space('E', 300), space('F', 200), space('G', 50)];

    const out = topSpacesByRevenue(list, 5);

    expect(out.map((s) => s.name)).toEqual(['B', 'D', 'E', 'F', 'A']);
    expect(out[0].revenue).toBe(9);
  });

  it('is empty when nothing earned money, and does not mutate its input', () => {
    const list = [space('A', 0)];
    expect(topSpacesByRevenue(list)).toEqual([]);

    const unsorted = [space('A', 1), space('B', 2)];
    topSpacesByRevenue(unsorted);
    expect(unsorted.map((s) => s.name)).toEqual(['A', 'B']);
  });
});

describe('helpers', () => {
  it('shortens long names for the axis', () => {
    expect(shortName('Short')).toBe('Short');
    expect(shortName('A very long coworking space name', 14)).toBe('A very long c…');
  });

  it('detects empty series so the UI shows an empty state', () => {
    const empty: AdminTrends = { days: 1, baseline: { spaces: 0, members: 0 }, series: [{ date: '2026-09-30', netCents: 0, paidBookings: 0, newSpaces: 0, newMembers: 0 }] };
    expect(hasAdminRevenue(empty)).toBe(false);
    expect(hasAdminBookings(empty)).toBe(false);
    expect(hasAnySpaces(empty)).toBe(false);
    expect(hasAdminRevenue(trends)).toBe(true);
    expect(hasAdminBookings(trends)).toBe(true);
    expect(hasAnySpaces(trends)).toBe(true);
  });
});
