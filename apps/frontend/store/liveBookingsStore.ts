import { create } from 'zustand';

export interface LiveBooking {
  id: string;
  bookableType: 'DESK' | 'ROOM';
  bookableId: string;
  userId: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

interface LiveBookingsState {
  bookings: LiveBooking[];
  setInitial: (bookings: LiveBooking[]) => void; // seed from a REST fetch
  addBooking: (booking: LiveBooking) => void; // pushed via booking_created
  removeBooking: (id: string) => void; // pushed via booking_cancelled
}

export const useLiveBookingsStore = create<LiveBookingsState>((set) => ({
  bookings: [],

  setInitial: (bookings) => set({ bookings }),

  addBooking: (booking) =>
    set((state) => {
      // Guard against duplicate delivery (e.g. a reconnect replaying an
      // event, or this client's own booking arriving back over the
      // socket after already being added optimistically elsewhere).
      if (state.bookings.some((b) => b.id === booking.id)) return state;
      return { bookings: [...state.bookings, booking] };
    }),

  removeBooking: (id) =>
    set((state) => ({ bookings: state.bookings.filter((b) => b.id !== id) })),
}));
