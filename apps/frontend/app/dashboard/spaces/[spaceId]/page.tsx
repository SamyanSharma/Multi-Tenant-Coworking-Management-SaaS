'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getAuthHeaders,
  getAdminSpaceDetail,
  getAdminSpaceMembers,
  getAdminSpaceBookings,
  type AdminSpaceDetail,
  type AdminMember,
  type AdminSpaceBookingsPage,
} from '@/lib/api';
import { formatCents } from '@/lib/money';
import { useAuthStore } from '@/store/authStore';
import {
  Building2,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  MapPin,
  Users,
  LayoutGrid,
  DoorOpen,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  Plus,
  Lock,
  Globe,
  Mail,
  DollarSign,
  Undo2,
} from 'lucide-react';

interface Zone {
  id: string;
  name: string;
}

interface SpaceInfo {
  id: string;
  name: string;
  slug: string;
}

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  PAID: 'bg-green-50 text-green-700 border-green-200',
  UNPAID: 'bg-slate-100 text-slate-600 border-slate-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  REFUND_PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  REFUNDED: 'bg-slate-100 text-slate-500 border-slate-200',
  REFUND_FAILED: 'bg-red-50 text-red-700 border-red-200',
};

export default function SpaceDetailPage() {
  const { spaceId: routeSpaceId } = useParams<{ spaceId: string }>();
  const ownSpaceId = useAuthStore((s) => s.spaceId);
  const role = useAuthStore((s) => s.role);
  const router = useRouter();

  const isOwnSpace = ownSpaceId === routeSpaceId;

  return isOwnSpace ? (
    <OwnSpaceView routeSpaceId={routeSpaceId} role={role} router={router} />
  ) : (
    <AdminSpaceView routeSpaceId={routeSpaceId} router={router} />
  );
}

// ---------------------------------------------------------------------
// A manager or member looking at their own space — unchanged from
// before this patch. (Its per-zone desk/room counts and the top-line
// member/utilization numbers are still not wired to real data — GET
// /zones and GET /spaces/me don't return counts. Left as-is here since
// fixing it is a separate, small backend change of its own; see
// PROGRESS.md.)
// ---------------------------------------------------------------------
function OwnSpaceView({
  routeSpaceId,
  role,
  router,
}: {
  routeSpaceId: string;
  role: string | null;
  router: ReturnType<typeof useRouter>;
}) {
  const [space, setSpace] = useState<SpaceInfo | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSpaceAndZones = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);

    setError(null);

    try {
      const base = process.env.NEXT_PUBLIC_API_URL;

      const spaceRes = await fetch(`${base}/spaces/me`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });

      if (!spaceRes.ok) {
        throw new Error(`Failed to load space (${spaceRes.status})`);
      }

      setSpace(await spaceRes.json());

      const zonesRes = await fetch(`${base}/zones`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });

      if (!zonesRes.ok) {
        throw new Error(
          zonesRes.status === 403
            ? 'Zone details are not available to this role yet.'
            : `Failed to load zones (${zonesRes.status})`,
        );
      }

      setZones(await zonesRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!routeSpaceId) return;
    fetchSpaceAndZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSpaceId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading space details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            {error.includes('403') || error.includes('role') ? (
              <Lock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            )}
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-amber-800 mb-1">Access Limited</h2>
              <p className="text-sm text-amber-700">{error}</p>
              <button
                onClick={() => router.push('/dashboard/spaces')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-600
                         text-white text-sm font-medium rounded-lg hover:bg-amber-700
                         transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Spaces
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Building2 className="w-12 h-12 text-slate-300 mb-4" />
        <p className="text-sm text-slate-500">Space not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <button
        onClick={() => router.push('/dashboard/spaces')}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900
                 mb-2 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back to Spaces
      </button>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-700/50 rounded-lg">
                <Building2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">{space.name}</h1>
                <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                  <Globe className="w-3.5 h-3.5" />/{space.slug}
                </p>
              </div>
            </div>

            <button
              onClick={() => fetchSpaceAndZones(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50
                       text-white rounded-lg text-sm font-medium hover:bg-slate-700
                       transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
          <div className="text-center">
            <div className="p-2 bg-blue-50 rounded-lg inline-flex mb-2">
              <LayoutGrid className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{zones.length}</div>
            <div className="text-xs text-slate-500">
              {zones.length === 1 ? 'Zone' : 'Zones'}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <LayoutGrid className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Zones</h2>
              <p className="text-sm text-slate-500">
                {zones.length} {zones.length === 1 ? 'zone' : 'zones'} available
              </p>
            </div>
          </div>

          {role === 'SPACE_MANAGER' && (
            <button
              onClick={() => router.push('/dashboard/zones/new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900
                       text-white rounded-lg text-sm font-medium hover:bg-slate-800
                       transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Zone
            </button>
          )}
        </div>

        {zones.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map((zone) => (
              <Link
                key={zone.id}
                href={`/dashboard/zones/${zone.id}`}
                className="group bg-white border-2 border-slate-200 rounded-xl p-5
                         hover:border-blue-500 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="p-2.5 bg-slate-50 rounded-lg group-hover:bg-blue-50
                                transition-colors"
                  >
                    <MapPin
                      className="w-5 h-5 text-slate-600 group-hover:text-blue-600
                                     transition-colors"
                    />
                  </div>
                  <ChevronRight
                    className="w-5 h-5 text-slate-400
                                       transition-transform group-hover:translate-x-1"
                  />
                </div>

                <h3
                  className="font-semibold text-slate-900 mb-2 group-hover:text-blue-600
                             transition-colors"
                >
                  {zone.name}
                </h3>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-slate-100 rounded-full mb-4">
              <MapPin className="w-12 h-12 text-slate-300" />
            </div>
            <p className="text-sm text-slate-500 mb-1">No zones in this space yet.</p>
            {role === 'SPACE_MANAGER' && (
              <button
                onClick={() => router.push('/dashboard/zones/new')}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-slate-900
                         text-white rounded-lg text-sm font-medium hover:bg-slate-800
                         transition-all"
              >
                <Plus className="w-4 h-4" />
                Create First Zone
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Platform Admin drilling into a space that isn't theirs. Everything
// here is real data from GET /admin/spaces/:id, /members, /bookings —
// no hard-coded numbers.
// ---------------------------------------------------------------------
type AdminTab = 'zones' | 'members' | 'transactions';

function AdminSpaceView({
  routeSpaceId,
  router,
}: {
  routeSpaceId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [detail, setDetail] = useState<AdminSpaceDetail | null>(null);
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [bookings, setBookings] = useState<AdminSpaceBookingsPage | null>(null);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [tab, setTab] = useState<AdminTab>('zones');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const [d, m] = await Promise.all([
        getAdminSpaceDetail(routeSpaceId),
        getAdminSpaceMembers(routeSpaceId),
      ]);
      setDetail(d);
      setMembers(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!routeSpaceId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSpaceId]);

  useEffect(() => {
    if (tab !== 'transactions' || !routeSpaceId) return;
    getAdminSpaceBookings(routeSpaceId, bookingsPage, 10)
      .then(setBookings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load transactions'));
  }, [tab, routeSpaceId, bookingsPage]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading space details...</p>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-amber-800 mb-1">Could not load this space</h2>
              <p className="text-sm text-amber-700">{error}</p>
              <button
                onClick={() => router.push('/dashboard/spaces')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-600
                         text-white text-sm font-medium rounded-lg hover:bg-amber-700
                         transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Spaces
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <button
        onClick={() => router.push('/dashboard/spaces')}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900
                 mb-2 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back to Spaces
      </button>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-700/50 rounded-lg">
                <Building2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold text-white">{detail.name}</h1>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      detail.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-500/10 text-slate-300 border-slate-500/30'
                    }`}
                  >
                    {detail.status}
                  </span>
                </div>
                <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                  <Globe className="w-3.5 h-3.5" />/{detail.slug}
                  {detail.manager && (
                    <>
                      <span className="mx-1">·</span>
                      <Mail className="w-3.5 h-3.5" />
                      {detail.manager.name ?? detail.manager.email}
                    </>
                  )}
                </p>
              </div>
            </div>

            <button
              onClick={() => load(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50
                       text-white rounded-lg text-sm font-medium hover:bg-slate-700
                       transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
          <StatCard icon={Users} color="green" value={detail.counts.members} label="Members" />
          <StatCard icon={LayoutGrid} color="blue" value={detail.counts.zones} label="Zones" />
          <StatCard icon={MapPin} color="purple" value={detail.counts.desks} label="Desks" />
          <StatCard icon={DoorOpen} color="amber" value={detail.counts.rooms} label="Rooms" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 pb-6">
          <StatCard
            icon={DollarSign}
            color="green"
            value={formatCents(detail.revenue.netCents)}
            label="Net revenue"
          />
          <StatCard
            icon={Undo2}
            color="amber"
            value={formatCents(detail.revenue.refundedCents)}
            label="Refunded"
          />
          <StatCard
            icon={DollarSign}
            color="blue"
            value={formatCents(detail.revenue.platformFeeNetCents)}
            label="Platform fee"
          />
          <StatCard
            icon={CalendarDays}
            color="purple"
            value={`${detail.revenue.last30d.bookings}`}
            label={`Bookings, last 30d (${formatCents(detail.revenue.last30d.netCents)})`}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {(
            [
              ['zones', 'Zones', detail.counts.zones],
              ['members', 'Members', detail.counts.members],
              ['transactions', 'Transactions', null],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                tab === key
                  ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
              {count !== null && <span className="ml-1.5 text-slate-400">({count})</span>}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'zones' &&
            (detail.zones.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {detail.zones.map((zone) => (
                  <div key={zone.id} className="border-2 border-slate-200 rounded-xl p-5">
                    <div className="p-2.5 bg-slate-50 rounded-lg inline-flex mb-3">
                      <MapPin className="w-5 h-5 text-slate-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-2">{zone.name}</h3>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <LayoutGrid className="w-3 h-3" />
                        {zone.desks} {zone.desks === 1 ? 'Desk' : 'Desks'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <DoorOpen className="w-3 h-3" />
                        {zone.rooms} {zone.rooms === 1 ? 'Room' : 'Rooms'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState label="No zones in this space yet." />
            ))}

          {tab === 'members' &&
            (members && members.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {members.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{m.name ?? '—'}</p>
                      <p className="text-xs text-slate-500">{m.email}</p>
                    </div>
                    <p className="text-xs text-slate-400">
                      Joined {new Date(m.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState label="No members have joined this space yet." />
            ))}

          {tab === 'transactions' && (
            <TransactionsTab
              bookings={bookings}
              page={bookingsPage}
              onPrev={() => setBookingsPage((p) => Math.max(1, p - 1))}
              onNext={() => setBookingsPage((p) => p + 1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof Users;
  color: 'blue' | 'green' | 'purple' | 'amber';
  value: string | number;
  label: string;
}) {
  const bg = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  }[color];

  return (
    <div className="text-center">
      <div className={`p-2 rounded-lg inline-flex mb-2 ${bg}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="p-4 bg-slate-100 rounded-full mb-4">
        <MapPin className="w-12 h-12 text-slate-300" />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function TransactionsTab({
  bookings,
  page,
  onPrev,
  onNext,
}: {
  bookings: AdminSpaceBookingsPage | null;
  page: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!bookings) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading transactions...
      </div>
    );
  }

  if (bookings.rows.length === 0 && page === 1) {
    return <EmptyState label="No bookings for this space yet." />;
  }

  const lastPage = Math.max(1, Math.ceil(bookings.total / bookings.pageSize));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <th className="pb-2 pr-4">Booking</th>
              <th className="pb-2 pr-4">Member</th>
              <th className="pb-2 pr-4">When</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.rows.map((b) => (
              <tr key={b.id}>
                <td className="py-2.5 pr-4 text-slate-900">{b.bookableName ?? b.bookableType}</td>
                <td className="py-2.5 pr-4 text-slate-600">{b.userName ?? b.userEmail}</td>
                <td className="py-2.5 pr-4 text-slate-500">
                  {new Date(b.startTime).toLocaleDateString()}
                </td>
                <td className="py-2.5 pr-4">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      PAYMENT_STATUS_STYLE[b.paymentStatus] ?? 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {b.paymentStatus}
                  </span>
                </td>
                <td className="py-2.5 text-slate-900 font-medium">
                  {b.amountCents != null ? formatCents(b.amountCents) : '—'}
                  {b.refundedAmountCents != null && (
                    <span className="text-xs text-slate-400 ml-1">
                      ({formatCents(b.refundedAmountCents)} refunded)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {page} of {lastPage} — {bookings.total} total
        </span>
        <div className="flex gap-2">
          <button
            onClick={onPrev}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg
                     disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <button
            onClick={onNext}
            disabled={page >= lastPage}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg
                     disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
