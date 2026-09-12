import { create } from 'zustand';
import { getAuthHeaders } from '@/lib/api';

export type BookableType = 'DESK' | 'ROOM';

interface BookingDraft {
  bookableType: BookableType | null;
  bookableId: string | null;
  startTime: string | null; // ISO string
  endTime: string | null; // ISO string
}

// What POST /bookings (and POST /bookings/:id/pay) return. clientSecret
// is null when no PaymentIntent was created (e.g. the Space Manager
// hasn't finished Stripe onboarding yet) — the booking still succeeds,
// just UNPAID, no payment step to show.
export interface CreatedBooking {
  id: string;
  amountCents: number | null;
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED';
  clientSecret: string | null;
}

interface BookingState {
  draft: BookingDraft;
  isSubmitting: boolean;
  error: string | null;
  lastCreatedBooking: CreatedBooking | null;
  setDraftResource: (bookableType: BookableType, bookableId: string) => void;
  setDraftTimes: (startTime: string, endTime: string) => void;
  clearDraft: () => void;
  // Returns the created booking on success (so the caller can check
  // clientSecret and show a payment step), or null on failure (check
  // `error` for why).
  submitBooking: () => Promise<CreatedBooking | null>;
}

const emptyDraft: BookingDraft = {
  bookableType: null,
  bookableId: null,
  startTime: null,
  endTime: null,
};

export const useBookingStore = create<BookingState>((set, get) => ({
  draft: emptyDraft,
  isSubmitting: false,
  error: null,
  lastCreatedBooking: null,

  setDraftResource: (bookableType, bookableId) =>
    set((state) => ({ draft: { ...state.draft, bookableType, bookableId } })),

  setDraftTimes: (startTime, endTime) =>
    set((state) => ({ draft: { ...state.draft, startTime, endTime } })),

  clearDraft: () => set({ draft: emptyDraft, error: null }),

  submitBooking: async () => {
    const { draft } = get();
    set({ isSubmitting: true, error: null });

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(draft),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        // NOTE: real backend returns 403 (not 409) on the double-booking
        // rejection — confirmed from bookings.service.ts. This still
        // works correctly since it checks !res.ok generically and reads
        // body.message regardless of status code, but don't branch on
        // res.status === 409 anywhere without checking this first.
        set({
          error: body?.message ?? 'Booking failed — that slot may already be taken.',
          isSubmitting: false,
        });
        return null;
      }

      set({ isSubmitting: false, draft: emptyDraft, lastCreatedBooking: body });
      return body as CreatedBooking;
    } catch {
      set({ error: 'Network error — please try again.', isSubmitting: false });
      return null;
    }
  },
}));
