// Shapes GET /admin/trends and the existing GET /admin/overview `perSpace`
// list into what the Platform Admin charts draw. No React/recharts here so
// it can be unit tested.
import { dayLabel } from './analyticsTrends';
import type { SpaceRow } from './adminOverview';

export interface AdminTrendPoint {
  date: string;
  netCents: number;
  paidBookings: number;
  newSpaces: number;
  newMembers: number;
}

export interface AdminTrends {
  days: number;
  series: AdminTrendPoint[];
  baseline: { spaces: number; members: number };
}

export interface AdminChartPoint {
  date: string;
  label: string;
  revenue: number; // dollars, PAID bookings paid that day
  paidBookings: number;
  spaces: number; // cumulative spaces ever created
  members: number; // cumulative member accounts ever created
}

// Turns per-day "new" counts into running totals, starting from the totals
// that already existed before the window.
export function toAdminChartSeries(trends: AdminTrends): AdminChartPoint[] {
  let spaces = trends.baseline.spaces;
  let members = trends.baseline.members;
  return trends.series.map((p) => {
    spaces += p.newSpaces;
    members += p.newMembers;
    return {
      date: p.date,
      label: dayLabel(p.date),
      revenue: p.netCents / 100,
      paidBookings: p.paidBookings,
      spaces,
      members,
    };
  });
}

export interface TopSpace {
  name: string;
  revenue: number; // dollars, net, trailing 30 days
}

// Already-aggregated data: overview.perSpace carries each space's trailing-30
// -day net revenue, so no extra request is needed for this chart.
export function topSpacesByRevenue(perSpace: SpaceRow[], limit = 5): TopSpace[] {
  return perSpace
    .filter((s) => s.netCents30d > 0)
    .sort((a, b) => b.netCents30d - a.netCents30d)
    .slice(0, limit)
    .map((s) => ({ name: s.name, revenue: s.netCents30d / 100 }));
}

export function shortName(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export const hasAdminRevenue = (t: AdminTrends) => t.series.some((p) => p.netCents > 0);
export const hasAdminBookings = (t: AdminTrends) => t.series.some((p) => p.paidBookings > 0);
export const hasAnySpaces = (t: AdminTrends) =>
  t.baseline.spaces > 0 || t.series.some((p) => p.newSpaces > 0);
