import { getAuthHeaders } from '@/lib/api';
import { formatCents } from '@/lib/money';

// Stage 9: Space Managers delete desks / rooms / zones. The backend answers
// three ways (see ARCHITECTURE.md §9.4/9.5):
//   - no upcoming bookings           -> deleted
//   - upcoming bookings, unconfirmed -> 409 ACTIVE_BOOKINGS + the impact
//   - upcoming bookings, confirmed   -> cancelled, refunded, deleted
export type DeletableKind = 'desk' | 'room' | 'zone';

export interface DeleteImpact {
  target: { type: 'DESK' | 'ROOM' | 'ZONE'; id: string; name: string };
  children: { desks: number; rooms: number };
  activeBookings: {
    count: number;
    paid: number;
    unpaid: number;
    holds: number;
    refundTotalCents: number;
  };
}

export interface DeleteResult {
  deleted: { type: string; id: string; name: string };
  cancelledBookings: number;
  refunds: { succeeded: number; failed: number; refundedCents: number };
}

export type DeleteOutcome =
  | { ok: true; result: DeleteResult }
  | { ok: false; reason: 'ACTIVE_BOOKINGS'; impact: DeleteImpact }
  | { ok: false; reason: 'ERROR'; message: string };

const COLLECTION: Record<DeletableKind, string> = {
  desk: 'desks',
  room: 'rooms',
  zone: 'zones',
};

const API_URL = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function readMessage(data: unknown, fallback: string): string {
  const m = (data as { message?: string | string[] } | null)?.message;
  if (!m) return fallback;
  return Array.isArray(m) ? m.join(', ') : m;
}

export async function fetchDeleteImpact(
  kind: DeletableKind,
  id: string,
): Promise<DeleteImpact> {
  const res = await fetch(`${API_URL()}/${COLLECTION[kind]}/${id}/delete-impact`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readMessage(data, `Could not check this ${kind} (${res.status})`));
  }
  return data as DeleteImpact;
}

export async function deleteResource(
  kind: DeletableKind,
  id: string,
  opts: { confirmRefund: boolean },
): Promise<DeleteOutcome> {
  const qs = opts.confirmRefund ? '?confirmRefund=true' : '';
  try {
    const res = await fetch(`${API_URL()}/${COLLECTION[kind]}/${id}${qs}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => null);

    if (res.ok) return { ok: true, result: data as DeleteResult };

    if (res.status === 409 && data?.code === 'ACTIVE_BOOKINGS' && data.impact) {
      return { ok: false, reason: 'ACTIVE_BOOKINGS', impact: data.impact };
    }
    return {
      ok: false,
      reason: 'ERROR',
      message: readMessage(data, `Delete failed (${res.status})`),
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'ERROR',
      message: err instanceof Error ? err.message : 'Network error',
    };
  }
}

export async function retryRefund(
  bookingId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${API_URL()}/bookings/${bookingId}/refund/retry`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: readMessage(data, `Retry failed (${res.status})`) };
    return { ok: Boolean(data?.ok), message: data?.ok ? undefined : 'Stripe still could not refund this booking' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' };
  }
}

// ---------------------------------------------------------------- copy
// All the wording of the two-step confirmation lives here so it can be unit
// tested (singular/plural, zone children, refund amounts).

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function hasActiveBookings(impact: DeleteImpact): boolean {
  return impact.activeBookings.count > 0;
}

// Step 1 — the plain "are you sure".
export function confirmCopy(kind: DeletableKind, impact: DeleteImpact) {
  const name = impact.target.name;
  const lines: string[] = [];

  if (kind === 'zone') {
    const { desks, rooms } = impact.children;
    if (desks + rooms === 0) {
      lines.push('This zone is empty.');
    } else {
      const parts: string[] = [];
      if (desks > 0) parts.push(plural(desks, 'desk'));
      if (rooms > 0) parts.push(plural(rooms, 'room'));
      lines.push(`This will also delete ${parts.join(' and ')} in it.`);
    }
  }

  lines.push('Past bookings and payment history are kept.');

  return {
    title: `Delete ${kind} “${name}”?`,
    question: `Are you sure you want to delete this ${kind}?`,
    lines,
    yes: 'Yes, delete',
    no: 'No',
  };
}

// Step 2 — only when there are upcoming bookings.
export function refundCopy(impact: DeleteImpact) {
  const { count, paid, refundTotalCents } = impact.activeBookings;
  const lines: string[] = [];

  lines.push(
    count === 1
      ? '1 upcoming booking will be cancelled.'
      : `${count} upcoming bookings will be cancelled.`,
  );
  if (paid > 0) {
    lines.push(
      `${plural(paid, 'paid booking')} will be refunded in full — ${formatCents(refundTotalCents)} back to the customer${paid === 1 ? '' : 's'}.`,
    );
  } else {
    lines.push('Nothing has been paid yet, so no money needs to be refunded.');
  }

  return {
    title: 'Upcoming bookings will be cancelled',
    question:
      count === 1
        ? 'There is an existing booking. Are you sure you want to delete and refund the customer?'
        : 'There are existing bookings. Are you sure you want to delete and refund the customers?',
    lines,
    yes: `Delete and refund ${plural(count, 'booking')}`,
    no: 'No',
  };
}

// Shown once the delete has gone through.
export function resultCopy(result: DeleteResult): { text: string; warning: boolean } {
  const { cancelledBookings, refunds } = result;
  if (cancelledBookings === 0) return { text: 'Deleted.', warning: false };

  const parts = [`${plural(cancelledBookings, 'booking')} cancelled`];
  if (refunds.succeeded > 0) {
    parts.push(`${formatCents(refunds.refundedCents)} refunded`);
  }
  if (refunds.failed > 0) {
    return {
      text: `Deleted. ${parts.join(', ')}. ${plural(refunds.failed, 'refund')} could not be completed yet — retry it from the Bookings page.`,
      warning: true,
    };
  }
  return { text: `Deleted. ${parts.join(', ')}.`, warning: false };
}
