import { create } from 'zustand';

export type BookableType = 'DESK' | 'ROOM';

interface BookingDraft {
  bookableType: BookableType | null;
  bookableId: string | null;
  startTime: string | null; // ISO string
  endTime: string | null;   // ISO string
}

interface BookingState {
  draft: BookingDraft;
  isSubmitting: boolean;
  error: string | null;
  setDraftResource: (bookableType: BookableType, bookableId: string) => void;
  setDraftTimes: (startTime: string, endTime: string) => void;
  clearDraft: () => void;
  submitBooking: () => Promise<boolean>; // returns success/failure
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

  setDraftResource: (bookableType, bookableId) =>
    set((state) => ({ draft: { ...state.draft, bookableType, bookableId } })),

  setDraftTimes: (startTime, endTime) =>
    set((state) => ({ draft: { ...state.draft, startTime, endTime } })),

  clearDraft: () => set({ draft: emptyDraft, error: null }),

  submitBooking: async () => {
    const { draft } = get();
    set({ isSubmitting: true, error: null });

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });

      if (!res.ok) {
        // Stage 4: this is where we catch Teammate A's concurrency
        // rejection (double-booking) and show it to the user.
        const body = await res.json().catch(() => null);
        set({
          error: body?.message ?? 'Booking failed — that slot may already be taken.',
          isSubmitting: false,
        });
        return false;
      }

      set({ isSubmitting: false, draft: emptyDraft });
      return true;
    } catch {
      set({ error: 'Network error — please try again.', isSubmitting: false });
      return false;
    }
  },
}));
