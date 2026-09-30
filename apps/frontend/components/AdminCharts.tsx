'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartCard from './ChartCard';
import type { SpaceRow } from '@/lib/adminOverview';
import {
  hasAdminBookings,
  hasAdminRevenue,
  hasAnySpaces,
  shortName,
  toAdminChartSeries,
  topSpacesByRevenue,
  type AdminTrends,
} from '@/lib/adminTrends';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const UNAVAILABLE = 'Trend data is unavailable right now';

// `trends` is null when GET /admin/trends failed: the three time-series
// cards then say so, while "Top spaces" still works because it only needs
// the overview data the page already loaded.
export default function AdminCharts({
  trends,
  perSpace,
}: {
  trends: AdminTrends | null;
  perSpace: SpaceRow[];
}) {
  const data = trends ? toAdminChartSeries(trends) : [];
  const top = topSpacesByRevenue(perSpace);
  const windowLabel = trends ? `Last ${trends.days} days` : '';
  const axis = { tick: { fontSize: 11 } };
  const xAxis = <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard
        title="Platform growth"
        subtitle={`${windowLabel} · running total of spaces created and member accounts`}
        empty={!trends || !hasAnySpaces(trends)}
        emptyText={trends ? 'No data yet' : UNAVAILABLE}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {xAxis}
            <YAxis {...axis} allowDecimals={false} width={32} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="spaces" name="Spaces" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="members" name="Members" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Net revenue across all spaces"
        subtitle={`${windowLabel} · paid bookings by payment date, refunds excluded`}
        empty={!trends || !hasAdminRevenue(trends)}
        emptyText={trends ? 'No data yet' : UNAVAILABLE}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {xAxis}
            <YAxis {...axis} tickFormatter={(v) => `$${v}`} width={52} />
            <Tooltip formatter={(v) => [usd.format(Number(v)), 'Net revenue']} />
            <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Paid bookings per day"
        subtitle={`${windowLabel} · across all spaces`}
        empty={!trends || !hasAdminBookings(trends)}
        emptyText={trends ? 'No data yet' : UNAVAILABLE}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {xAxis}
            <YAxis {...axis} allowDecimals={false} width={32} />
            <Tooltip formatter={(v) => [Number(v), 'Paid bookings']} />
            <Bar dataKey="paidBookings" fill="#2563eb" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Top spaces by revenue"
        subtitle="Last 30 days · net revenue, top 5"
        empty={top.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" {...axis} tickFormatter={(v) => `$${v}`} />
            <YAxis type="category" dataKey="name" {...axis} width={96} tickFormatter={(n) => shortName(String(n))} />
            <Tooltip formatter={(v) => [usd.format(Number(v)), 'Net revenue']} />
            <Bar dataKey="revenue" fill="#059669" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
