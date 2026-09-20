// Shape of GET /admin/overview (see backend admin.service.ts). All money is
// integer USD cents.
export interface SpaceRow {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'CLOSED';
  createdAt: string;
  members: number;
  desks: number;
  rooms: number;
  netCents: number;
  netCents30d: number;
  bookings30d: number;
}

export interface AdminOverview {
  generatedAt: string;
  spaces: { active: number; closed: number; createdLast30d: number };
  members: { total: number };
  payments: { byStatus: Record<string, number> };
  revenue: {
    collectedCents: number;
    refundedCents: number;
    pendingRefundCents: number;
    netCents: number;
    platformFeeNetCents: number;
    last30d: { netCents: number; platformFeeNetCents: number; bookings: number };
    prev30d: { netCents: number };
    changePct: number | null;
  };
  perSpace: SpaceRow[];
}

// Display order + colours for the "payments by status" bar.
export const STATUS_META: Record<string, { label: string; bar: string; dot: string }> = {
  PAID: { label: 'Paid', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  PENDING: { label: 'Payment in progress', bar: 'bg-amber-400', dot: 'bg-amber-400' },
  UNPAID: { label: 'Unpaid', bar: 'bg-slate-400', dot: 'bg-slate-400' },
  FAILED: { label: 'Failed', bar: 'bg-red-500', dot: 'bg-red-500' },
  REFUNDED: { label: 'Refunded', bar: 'bg-sky-500', dot: 'bg-sky-500' },
  REFUND_PENDING: { label: 'Refund pending', bar: 'bg-violet-400', dot: 'bg-violet-400' },
  REFUND_FAILED: { label: 'Refund failed', bar: 'bg-rose-600', dot: 'bg-rose-600' },
};
const STATUS_ORDER = Object.keys(STATUS_META);

export interface StatusSegment {
  status: string;
  label: string;
  count: number;
  pct: number; // 0..100, share of all bookings
  bar: string;
  dot: string;
}

// Turns { PAID: 5, REFUNDED: 1 } into ordered, percentage-annotated segments
// for the stacked bar. Unknown statuses (a future enum value) are appended
// rather than dropped, so the bar always adds up to 100%.
export function statusSegments(byStatus: Record<string, number>): StatusSegment[] {
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const known = STATUS_ORDER.filter((s) => (byStatus[s] ?? 0) > 0);
  const unknown = Object.keys(byStatus).filter((s) => !STATUS_META[s] && byStatus[s] > 0);

  return [...known, ...unknown].map((status) => {
    const meta = STATUS_META[status] ?? { label: status, bar: 'bg-slate-300', dot: 'bg-slate-300' };
    return {
      status,
      label: meta.label,
      count: byStatus[status],
      pct: (byStatus[status] / total) * 100,
      bar: meta.bar,
      dot: meta.dot,
    };
  });
}

export function filterSpaces(rows: SpaceRow[], term: string): SpaceRow[] {
  const q = term.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
}
