import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useBookingStore } from '../bookingStore';
import { useAuthStore } from '../authStore';

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useAuthStore.setState({ token: 'test-token', role: 'MEMBER', spaceId: 'space-1' });
  useBookingStore.setState({
    draft: {
      bookableType: 'DESK',
      bookableId: 'desk-1',
      startTime: '2026-09-20T09:00:00.000Z',
      endTime: '2026-09-20T10:00:00.000Z',
    },
    isSubmitting: false,
    error: null,
    lastCreatedBooking: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bookingStore.submitBooking', () => {
  it('returns the created booking (with clientSecret) on success', async () => {
    const booking = {
      id: 'booking-1',
      amountCents: 1000,
      paymentStatus: 'PENDING',
      clientSecret: 'pi_123_secret',
    };
    mockFetchOnce(201, booking);

    const result = await useBookingStore.getState().submitBooking();

    expect(result).toEqual(booking);
    expect(useBookingStore.getState().lastCreatedBooking).toEqual(booking);
    expect(useBookingStore.getState().isSubmitting).toBe(false);
    // Draft is cleared after a successful submit.
    expect(useBookingStore.getState().draft.bookableId).toBeNull();
  });

  it('returns a booking with clientSecret: null when no payment was needed', async () => {
    const booking = {
      id: 'booking-2',
      amountCents: 1000,
      paymentStatus: 'UNPAID',
      clientSecret: null,
    };
    mockFetchOnce(201, booking);

    const result = await useBookingStore.getState().submitBooking();

    expect(result?.clientSecret).toBeNull();
  });

  it('returns null and sets error on a non-2xx response', async () => {
    mockFetchOnce(409, { message: 'This slot is already booked.' });

    const result = await useBookingStore.getState().submitBooking();

    expect(result).toBeNull();
    expect(useBookingStore.getState().error).toBe('This slot is already booked.');
    expect(useBookingStore.getState().isSubmitting).toBe(false);
  });

  it('returns null and sets a network error message when fetch itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );

    const result = await useBookingStore.getState().submitBooking();

    expect(result).toBeNull();
    expect(useBookingStore.getState().error).toBe(
      'Network error — please try again.',
    );
  });
});
