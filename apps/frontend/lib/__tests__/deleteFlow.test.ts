import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  confirmCopy,
  refundCopy,
  resultCopy,
  hasActiveBookings,
  deleteResource,
  fetchDeleteImpact,
  retryRefund,
  DeleteImpact,
} from '../deleteFlow';
import { formatCents, formatChangePct } from '../money';

vi.mock('@/lib/api', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer t' }) }));

const impact = (over: Partial<DeleteImpact> = {}): DeleteImpact => ({
  target: { type: 'DESK', id: 'd1', name: 'Desk A1' },
  children: { desks: 0, rooms: 0 },
  activeBookings: { count: 0, paid: 0, unpaid: 0, holds: 0, refundTotalCents: 0 },
  ...over,
});

describe('money formatting', () => {
  it('formats cents as USD', () => {
    expect(formatCents(2500)).toBe('$25.00');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(null)).toBe('$0.00');
    expect(formatCents(123456)).toBe('$1,234.56');
  });
  it('formats change %, with an em dash when there is nothing to compare', () => {
    expect(formatChangePct(50)).toBe('+50%');
    expect(formatChangePct(-12)).toBe('-12%');
    expect(formatChangePct(0)).toBe('0%');
    expect(formatChangePct(null)).toBe('—');
  });
});

describe('confirmCopy (step 1: "Are you sure?")', () => {
  it('asks the plain question for a desk', () => {
    const c = confirmCopy('desk', impact());
    expect(c.title).toBe('Delete desk “Desk A1”?');
    expect(c.question).toBe('Are you sure you want to delete this desk?');
    expect(c.yes).toBe('Yes, delete');
    expect(c.no).toBe('No');
  });

  it('tells you a zone takes its desks and rooms with it (singular and plural)', () => {
    const many = confirmCopy('zone', impact({ target: { type: 'ZONE', id: 'z', name: 'Focus' }, children: { desks: 5, rooms: 2 } }));
    expect(many.lines[0]).toBe('This will also delete 5 desks and 2 rooms in it.');
    const one = confirmCopy('zone', impact({ target: { type: 'ZONE', id: 'z', name: 'Focus' }, children: { desks: 1, rooms: 0 } }));
    expect(one.lines[0]).toBe('This will also delete 1 desk in it.');
    const empty = confirmCopy('zone', impact({ target: { type: 'ZONE', id: 'z', name: 'Focus' } }));
    expect(empty.lines[0]).toBe('This zone is empty.');
  });

  it('reassures that history is kept', () => {
    expect(confirmCopy('room', impact()).lines.join(' ')).toContain('Past bookings and payment history are kept');
  });
});

describe('refundCopy (step 2: upcoming bookings)', () => {
  it('uses the exact singular question the owner specified', () => {
    const c = refundCopy(impact({ activeBookings: { count: 1, paid: 1, unpaid: 0, holds: 0, refundTotalCents: 2500 } }));
    expect(c.question).toBe('There is an existing booking. Are you sure you want to delete and refund the customer?');
    expect(c.yes).toBe('Delete and refund 1 booking');
    expect(c.lines[1]).toBe('1 paid booking will be refunded in full — $25.00 back to the customer.');
  });

  it('pluralises for several bookings and sums the refund', () => {
    const c = refundCopy(impact({ activeBookings: { count: 3, paid: 2, unpaid: 1, holds: 0, refundTotalCents: 5000 } }));
    expect(c.question).toBe('There are existing bookings. Are you sure you want to delete and refund the customers?');
    expect(c.yes).toBe('Delete and refund 3 bookings');
    expect(c.lines[0]).toBe('3 upcoming bookings will be cancelled.');
    expect(c.lines[1]).toBe('2 paid bookings will be refunded in full — $50.00 back to the customers.');
  });

  it('says so when nothing was paid', () => {
    const c = refundCopy(impact({ activeBookings: { count: 2, paid: 0, unpaid: 2, holds: 0, refundTotalCents: 0 } }));
    expect(c.lines[1]).toBe('Nothing has been paid yet, so no money needs to be refunded.');
  });
});

describe('resultCopy', () => {
  const r = (over = {}) => ({
    deleted: { type: 'DESK', id: 'd', name: 'x' },
    cancelledBookings: 0,
    refunds: { succeeded: 0, failed: 0, refundedCents: 0 },
    ...over,
  });
  it('plain delete', () => expect(resultCopy(r())).toEqual({ text: 'Deleted.', warning: false }));
  it('cancelled and refunded', () =>
    expect(resultCopy(r({ cancelledBookings: 2, refunds: { succeeded: 1, failed: 0, refundedCents: 2500 } }))).toEqual({
      text: 'Deleted. 2 bookings cancelled, $25.00 refunded.',
      warning: false,
    }));
  it('warns when a refund failed', () => {
    const c = resultCopy(r({ cancelledBookings: 1, refunds: { succeeded: 0, failed: 1, refundedCents: 0 } }));
    expect(c.warning).toBe(true);
    expect(c.text).toContain('1 refund could not be completed yet');
  });
});

describe('hasActiveBookings', () => {
  it('is driven by the count', () => {
    expect(hasActiveBookings(impact())).toBe(false);
    expect(hasActiveBookings(impact({ activeBookings: { count: 1, paid: 0, unpaid: 1, holds: 0, refundTotalCents: 0 } }))).toBe(true);
  });
});

describe('API calls', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

  it('fetchDeleteImpact hits /<collection>/:id/delete-impact with the auth header', async () => {
    respond(200, impact());
    await fetchDeleteImpact('zone', 'z9');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/zones\/z9\/delete-impact$/);
    expect(init.headers).toEqual({ Authorization: 'Bearer t' });
  });

  it('deleteResource without confirm sends a plain DELETE (no confirmRefund flag)', async () => {
    respond(200, { deleted: {}, cancelledBookings: 0, refunds: { succeeded: 0, failed: 0, refundedCents: 0 } });
    const out = await deleteResource('desk', 'd1', { confirmRefund: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/desks\/d1$/);
    expect(init.method).toBe('DELETE');
    expect(out.ok).toBe(true);
  });

  it('deleteResource with confirm adds ?confirmRefund=true', async () => {
    respond(200, { deleted: {}, cancelledBookings: 1, refunds: { succeeded: 1, failed: 0, refundedCents: 2500 } });
    await deleteResource('room', 'r1', { confirmRefund: true });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/rooms\/r1\?confirmRefund=true$/);
  });

  it('maps a 409 ACTIVE_BOOKINGS response to a "needs refund confirmation" outcome with the impact', async () => {
    const imp = impact({ activeBookings: { count: 2, paid: 1, unpaid: 1, holds: 0, refundTotalCents: 2500 } });
    respond(409, { code: 'ACTIVE_BOOKINGS', message: 'x', impact: imp });
    const out = await deleteResource('desk', 'd1', { confirmRefund: false });
    expect(out).toEqual({ ok: false, reason: 'ACTIVE_BOOKINGS', impact: imp });
  });

  it('other errors surface the backend message; array messages are joined', async () => {
    respond(404, { message: 'Desk not found in this space' });
    expect(await deleteResource('desk', 'd1', { confirmRefund: false })).toEqual({
      ok: false, reason: 'ERROR', message: 'Desk not found in this space',
    });
    respond(400, { message: ['a', 'b'] });
    expect(await deleteResource('desk', 'd1', { confirmRefund: false })).toMatchObject({ message: 'a, b' });
  });

  it('a network failure is reported, not thrown', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await deleteResource('desk', 'd1', { confirmRefund: false })).toEqual({
      ok: false, reason: 'ERROR', message: 'offline',
    });
  });

  it('retryRefund reports success and "still failing"', async () => {
    respond(201, { ok: true });
    expect(await retryRefund('b1')).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/bookings\/b1\/refund\/retry$/);
    respond(201, { ok: false });
    expect((await retryRefund('b1')).ok).toBe(false);
    respond(404, { message: 'No refund waiting for a retry on this booking' });
    expect(await retryRefund('b1')).toEqual({ ok: false, message: 'No refund waiting for a retry on this booking' });
  });
});
