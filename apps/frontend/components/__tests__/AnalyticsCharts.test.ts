import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import AnalyticsCharts from '../AnalyticsCharts';
import type { Trends } from '@/lib/analyticsTrends';

const empty: Trends = {
  days: 7,
  series: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-09-${String(24 + i).padStart(2, '0')}`,
    bookings: 0,
    revenueCents: 0,
  })),
  byType: { desk: 0, room: 0 },
};

describe('AnalyticsCharts (server render smoke test)', () => {
  it('renders all three chart cards without crashing when there is data', () => {
    const busy: Trends = {
      ...empty,
      series: empty.series.map((p, i) => ({ ...p, bookings: i, revenueCents: i * 1000 })),
      byType: { desk: 4, room: 2 },
    };

    const html = renderToString(createElement(AnalyticsCharts, { trends: busy }));

    expect(html).toContain('Revenue over time');
    expect(html).toContain('Bookings per day');
    expect(html).toContain('Desk vs room bookings');
    expect(html).not.toContain('No data yet');
  });

  it('shows an empty state on every card for a space with no bookings', () => {
    const html = renderToString(createElement(AnalyticsCharts, { trends: empty }));

    expect(html.match(/No data yet/g)).toHaveLength(3);
  });
});
