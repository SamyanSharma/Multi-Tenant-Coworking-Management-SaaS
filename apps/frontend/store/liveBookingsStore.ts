import { create } from 'zustand';

export interface LiveBooking {
  id: string;
  bookableType: 'DESK' | 'ROOM';
  bookableId: string;
  userId: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  // Stage 9: cancelled bookings never occupy a slot.
  cancelledAt?: string | null;
}

// Last "a desk/room/zone was deleted" broadcast (socket: resource_deleted).
// Pages that show that resource watch this to refetch or leave the page.
export interface ResourceDeletedEvent {
  type: 'DESK' | 'ROOM' | 'ZONE';
  id: string;
  deskIds: string[];
  roomIds: string[];
}

interface LiveBookingsState {
  bookings: LiveBooking[];
  setInitial: (bookings: LiveBooking[]) => void; // seed from a REST fetch
  addBooking: (booking: LiveBooking) => void; // pushed via booking_created
  removeBooking: (id: string) => void; // pushed via booking_cancelled
  // pushed via resource_deleted: drop every booking of the deleted
  // desks/rooms so floor plans stop showing them as occupied.
  removeByResourceIds: (resourceIds: string[]) => void;
  lastResourceDeleted: ResourceDeletedEvent | null;
  noteResourceDeleted: (event: ResourceDeletedEvent) => void;
}

export const useLiveBookingsStore = create<LiveBookingsState>((set) => ({
  bookings: [],
  lastResourceDeleted: null,

  // Cancelled bookings are history, not occupancy: keep them out of the
  // live list that drives "occupied now" on the floor plan.
  setInitial: (bookings) =>
    set({ bookings: bookings.filter((b) => !b.cancelledAt) }),

  addBooking: (booking) =>
    set((state) => {
      // Guard against duplicate delivery (e.g. a reconnect replaying an
      // event, or this client's own booking arriving back over the
      // socket after already being added optimistically elsewhere).
      if (booking.cancelledAt) return state;
      if (state.bookings.some((b) => b.id === booking.id)) return state;
      return { bookings: [...state.bookings, booking] };
    }),

  removeBooking: (id) =>
    set((state) => ({ bookings: state.bookings.filter((b) => b.id !== id) })),

  removeByResourceIds: (resourceIds) =>
    set((state) => {
      const gone = new Set(resourceIds);
      return {
        bookings: state.bookings.filter((b) => !gone.has(b.bookableId)),
      };
    }),

  noteResourceDeleted: (event) => set({ lastResourceDeleted: event }),
}));
