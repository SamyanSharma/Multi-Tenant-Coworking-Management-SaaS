import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import AdminCharts from '../AdminCharts';
import type { AdminTrends } from '@/lib/adminTrends';
import type { SpaceRow } from '@/lib/adminOverview';

const day = (i: number) => `2026-09-${String(24 + i).padStart(2, '0')}`;

const busy: AdminTrends = {
  days: 7,
  baseline: { spaces: 2, members: 5 },
  series: Array.from({ length: 7 }, (_, i) => ({
    date: day(i), netCents: i * 1000, paidBookings: i, newSpaces: i % 2, newMembers: 1,
  })),
};

const quiet: AdminTrends = {
  days: 7,
  baseline: { spaces: 0, members: 0 },
  series: Array.from({ length: 7 }, (_, i) => ({
    date: day(i), netCents: 0, paidBookings: 0, newSpaces: 0, newMembers: 0,
  })),
};

const space = (name: string, netCents30d: number): SpaceRow => ({
  id: name, name, slug: name, status: 'ACTIVE', createdAt: '2026-01-01',
  members: 1, desks: 1, rooms: 0, netCents: netCents30d, netCents30d, bookings30d: 1,
});

describe('AdminCharts (server render smoke test)', () => {
  it('renders all four cards with data', () => {
    const html = renderToString(
      createElement(AdminCharts, { trends: busy, perSpace: [space('Alpha', 5000)] }),
    );

    for (const title of ['Platform growth', 'Net revenue across all spaces', 'Paid bookings per day', 'Top spaces by revenue']) {
      expect(html).toContain(title);
    }
    expect(html).not.toContain('No data yet');
    expect(html).not.toContain('unavailable');
  });

  it('shows an empty state on every card for a platform with no activity', () => {
    const html = renderToString(createElement(AdminCharts, { trends: quiet, perSpace: [] }));

    expect(html.match(/No data yet/g)).toHaveLength(4);
  });

  it('degrades to "unavailable" on the three trend cards when the trends request failed, but still shows top spaces', () => {
    const html = renderToString(
      createElement(AdminCharts, { trends: null, perSpace: [space('Alpha', 5000)] }),
    );

    expect(html.match(/Trend data is unavailable right now/g)).toHaveLength(3);
    expect(html).toContain('Top spaces by revenue');
    expect(html).not.toContain('No data yet');
  });
});
