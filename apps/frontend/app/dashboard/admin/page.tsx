'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';
import { formatCents, formatChangePct } from '@/lib/money';
import {
  AdminOverview,
  filterSpaces,
  statusSegments,
} from '@/lib/adminOverview';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  DollarSign,
  Landmark,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react';

function KpiCard({
  icon,
  tone,
  label,
  value,
  sub,
  testId,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  sub?: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function PlatformOverviewPage() {
  const role = useAuthStore((s) => s.role);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState('');

  const load = useCallback(async (initial = true) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/overview`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Failed to load the platform overview (${res.status})`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the platform overview');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'PLATFORM_ADMIN') void load();
    else setLoading(false);
  }, [role, load]);

  if (role !== 'PLATFORM_ADMIN') {
    return (
      <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center text-center">
        <ShieldAlert className="mb-3 h-10 w-10 text-slate-300" />
        <h1 className="text-lg font-semibold text-slate-900">Platform admins only</h1>
        <p className="mt-1 text-sm text-slate-500">This page shows numbers across every space, so it is limited to platform administrators.</p>
        <Link href="/dashboard/spaces" className="mt-4 text-sm font-medium text-blue-600 hover:underline">
          Go to your space
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-500">Loading platform overview…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <h2 className="text-sm font-semibold text-red-800">Could not load the overview</h2>
            <p className="mt-1 text-sm text-red-700">{error}</p>
            <button
              onClick={() => load()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { revenue, spaces, members, payments, perSpace } = data;
  const segments = statusSegments(payments.byStatus);
  const totalBookings = segments.reduce((a, s) => a + s.count, 0);
  const rows = filterSpaces(perSpace, term);
  const change = revenue.changePct;
  const up = change !== null && change > 0;
  const down = change !== null && change < 0;
  const refundAttention = revenue.pendingRefundCents > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-2 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform overview</h1>
          <p className="text-sm text-slate-500">
            Every space, member and payment on the platform · updated{' '}
            {new Date(data.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <button
          onClick={() => load(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          testId="kpi-active-spaces"
          icon={<Building2 className="h-5 w-5" />}
          tone="bg-blue-50 text-blue-600"
          label="Active spaces"
          value={String(spaces.active)}
          sub={`${spaces.closed} closed · ${spaces.createdLast30d} new in the last 30 days`}
        />
        <KpiCard
          testId="kpi-members"
          icon={<Users className="h-5 w-5" />}
          tone="bg-violet-50 text-violet-600"
          label="Members across spaces"
          value={String(members.total)}
          sub="Members of active spaces"
        />
        <KpiCard
          testId="kpi-net-revenue"
          icon={<DollarSign className="h-5 w-5" />}
          tone="bg-emerald-50 text-emerald-600"
          label="Net revenue"
          value={formatCents(revenue.netCents)}
          sub="All time, paid bookings only — refunds excluded"
        />
        <KpiCard
          testId="kpi-platform-earnings"
          icon={<Landmark className="h-5 w-5" />}
          tone="bg-amber-50 text-amber-600"
          label="Platform earnings (5%)"
          value={formatCents(revenue.platformFeeNetCents)}
          sub="Application fees on paid bookings"
        />
        <KpiCard
          testId="kpi-last-30d"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="bg-sky-50 text-sky-600"
          label="Revenue · last 30 days"
          value={formatCents(revenue.last30d.netCents)}
          sub={
            <span className="inline-flex flex-wrap items-center gap-1">
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  up ? 'text-emerald-600' : down ? 'text-red-600' : 'text-slate-500'
                }`}
              >
                {up && <ArrowUpRight className="h-3.5 w-3.5" />}
                {down && <ArrowDownRight className="h-3.5 w-3.5" />}
                {formatChangePct(change)}
              </span>
              vs previous 30 days · {revenue.last30d.bookings} paid bookings
              <span className="block w-full text-[11px] text-slate-400">
                Trailing 30 days — not MRR (payments are per booking, there are no subscriptions).
              </span>
            </span>
          }
        />
        <KpiCard
          testId="kpi-refunded"
          icon={<RotateCcw className="h-5 w-5" />}
          tone={refundAttention ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}
          label="Refunded"
          value={formatCents(revenue.refundedCents)}
          sub={
            refundAttention ? (
              <span className="font-medium text-rose-600">
                {formatCents(revenue.pendingRefundCents)} refund waiting to complete
              </span>
            ) : (
              'No refunds outstanding'
            )
          }
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Payments by status">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">Payments by status</h2>
          <span className="text-xs text-slate-500">{totalBookings} bookings</span>
        </div>
        {segments.length === 0 ? (
          <p className="text-sm text-slate-500">No bookings yet.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Share of bookings by payment status">
              {segments.map((s) => (
                <div key={s.status} className={s.bar} style={{ width: `${s.pct}%` }} title={`${s.label}: ${s.count}`} />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
              {segments.map((s) => (
                <li key={s.status} className="inline-flex items-center gap-1.5" data-testid={`status-${s.status}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                  {s.label}
                  <span className="font-semibold text-slate-900">{s.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Spaces">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Spaces <span className="ml-1 text-sm font-normal text-slate-500">({perSpace.length})</span>
          </h2>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search spaces…"
              aria-label="Search spaces"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{perSpace.length === 0 ? 'No spaces yet.' : 'No spaces match your search.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Space</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Members</th>
                  <th className="px-3 py-3 text-right font-semibold">Desks</th>
                  <th className="px-3 py-3 text-right font-semibold">Rooms</th>
                  <th className="px-3 py-3 text-right font-semibold">Bookings 30d</th>
                  <th className="px-3 py-3 text-right font-semibold">Revenue 30d</th>
                  <th className="px-5 py-3 text-right font-semibold">Revenue total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} data-testid={`space-row-${r.id}`} className={r.status === 'CLOSED' ? 'bg-slate-50/60 text-slate-500' : ''}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{r.name}</p>
                      <p className="text-xs text-slate-500">/{r.slug}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {r.status === 'ACTIVE' ? 'Active' : 'Closed'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.members}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.desks}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.rooms}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.bookings30d}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCents(r.netCents30d)}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-900">{formatCents(r.netCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
