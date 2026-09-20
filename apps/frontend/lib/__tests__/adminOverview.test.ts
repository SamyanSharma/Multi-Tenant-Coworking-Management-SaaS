import { describe, it, expect } from 'vitest';
import { statusSegments, filterSpaces, SpaceRow } from '../adminOverview';
import { homeFor } from '../home';

describe('statusSegments', () => {
  it('is empty when there are no bookings at all', () => {
    expect(statusSegments({})).toEqual([]);
  });

  it('orders known statuses consistently and computes shares that add up to 100', () => {
    const segs = statusSegments({ REFUNDED: 1, PAID: 6, UNPAID: 3 });
    expect(segs.map((s) => s.status)).toEqual(['PAID', 'UNPAID', 'REFUNDED']);
    expect(segs.map((s) => s.count)).toEqual([6, 3, 1]);
    expect(segs.reduce((a, s) => a + s.pct, 0)).toBeCloseTo(100);
    expect(segs[0].pct).toBeCloseTo(60);
  });

  it('skips zero counts', () => {
    expect(statusSegments({ PAID: 2, FAILED: 0 }).map((s) => s.status)).toEqual(['PAID']);
  });

  it('keeps an unknown future status instead of dropping it', () => {
    const segs = statusSegments({ PAID: 1, SOMETHING_NEW: 1 });
    expect(segs.map((s) => s.status)).toEqual(['PAID', 'SOMETHING_NEW']);
    expect(segs[1].label).toBe('SOMETHING_NEW');
    expect(segs.reduce((a, s) => a + s.pct, 0)).toBeCloseTo(100);
  });
});

describe('filterSpaces', () => {
  const row = (name: string, slug: string): SpaceRow => ({
    id: slug, name, slug, status: 'ACTIVE', createdAt: '', members: 0, desks: 0, rooms: 0, netCents: 0, netCents30d: 0, bookings30d: 0,
  });
  const rows = [row('Alpha Hub', 'alpha-hub'), row('Beta Works', 'beta-works')];
  it('matches name or slug, case-insensitively', () => {
    expect(filterSpaces(rows, 'ALPHA')).toHaveLength(1);
    expect(filterSpaces(rows, 'works')).toHaveLength(1);
    expect(filterSpaces(rows, '  ')).toHaveLength(2);
    expect(filterSpaces(rows, 'zzz')).toHaveLength(0);
  });
});

describe('homeFor', () => {
  it('sends a platform admin to the overview and everyone else to the space list', () => {
    expect(homeFor('PLATFORM_ADMIN')).toBe('/dashboard/admin');
    expect(homeFor('SPACE_MANAGER')).toBe('/dashboard/spaces');
    expect(homeFor('MEMBER')).toBe('/dashboard/spaces');
    expect(homeFor(null)).toBe('/dashboard/spaces');
  });
});
