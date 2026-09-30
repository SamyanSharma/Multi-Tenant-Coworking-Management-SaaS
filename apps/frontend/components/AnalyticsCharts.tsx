'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  hasBookings,
  hasRevenue,
  hasTypeSplit,
  toChartSeries,
  toTypeSplit,
  type Trends,
} from '@/lib/analyticsTrends';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function ChartCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500 mb-4">{subtitle}</p>
      {empty ? (
        <div className="h-64 flex items-center justify-center text-sm text-slate-400">
          No data yet
        </div>
      ) : (
        <div className="h-64">{children}</div>
      )}
    </div>
  );
}

const PIE_COLORS = ['#2563eb', '#f59e0b'];

export default function AnalyticsCharts({ trends }: { trends: Trends }) {
  const data = toChartSeries(trends.series);
  const split = toTypeSplit(trends.byType);
  const windowLabel = `Last ${trends.days} days`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard
        title="Revenue over time"
        subtitle={`${windowLabel} · paid bookings, by booking date`}
        empty={!hasRevenue(trends.series)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={52} />
            <Tooltip formatter={(v) => [usd.format(Number(v)), 'Revenue']} />
            <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Bookings per day"
        subtitle={`${windowLabel} · all non-cancelled bookings`}
        empty={!hasBookings(trends.series)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
            <Tooltip formatter={(v) => [Number(v), 'Bookings']} />
            <Bar dataKey="bookings" fill="#2563eb" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Desk vs room bookings"
        subtitle="All time · non-cancelled bookings"
        empty={!hasTypeSplit(trends.byType)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={split} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {split.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
