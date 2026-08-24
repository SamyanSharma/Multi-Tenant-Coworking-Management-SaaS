'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore, Role } from '@/store/authStore';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useLiveBookingsStore, LiveBooking } from '@/store/liveBookingsStore';

interface NavItem {
  label: string;
  href: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'All Spaces', href: '/dashboard/spaces', roles: ['PLATFORM_ADMIN'] },
  { label: 'My Space', href: '/dashboard/spaces', roles: ['SPACE_MANAGER', 'MEMBER'] },
  { label: 'Bookings', href: '/dashboard/bookings', roles: ['MEMBER', 'SPACE_MANAGER'] },
  { label: 'Manage Zones', href: '/dashboard/zones', roles: ['SPACE_MANAGER', 'MEMBER'] },
  { label: 'Billing', href: '/dashboard/settings/billing', roles: ['SPACE_MANAGER', 'MEMBER'] },
  { label: 'Analytics', href: '/dashboard/analytics', roles: ['SPACE_MANAGER'] },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = useAuthStore((state) => state.role);
  const spaceId = useAuthStore((state) => state.spaceId);
  const addBooking = useLiveBookingsStore((state) => state.addBooking);

  // One socket connection for the whole dashboard session, with the
  // booking_created listener registered here rather than per-component —
  // this keeps liveBookingsStore up to date no matter which page is
  // currently mounted.
  //
  // NOTE: booking_cancelled is NOT wired up yet — events.gateway.ts
  // doesn't emit it (only emitBookingCreated exists today). The store's
  // removeBooking action is ready for when that's added; wiring a
  // listener for an event the backend never sends would just be dead
  // code that looks connected but silently never fires.
  useEffect(() => {
    // A socket connection requires tenant identity. PLATFORM_ADMIN has
    // no spaceId, and the gateway only allows SPACE_MANAGER/MEMBER roles
    // to join a space room — connectSocket() itself no-ops in that case.
    const socket = connectSocket({ spaceId, role });

    if (!socket) {
      disconnectSocket();
      return;
    }

    const handleConnect = () => {
      console.log(
        `[Realtime] Connected to space ${spaceId} as ${role} (${socket.id})`,
      );
    };

    const handleConnectionError = (payload: { message?: string }) => {
      console.error(
        '[Realtime] Connection rejected:',
        payload?.message ?? 'Unknown connection error',
      );
    };

    const handleDisconnect = (reason: string) => {
      console.log(`[Realtime] Disconnected: ${reason}`);
    };

    const handleBookingCreated = (booking: LiveBooking) => {
      console.log('[Realtime] booking_created:', booking);
      addBooking(booking);
    };

    socket.on('connect', handleConnect);
    socket.on('connection_error', handleConnectionError);
    socket.on('disconnect', handleDisconnect);
    socket.on('booking_created', handleBookingCreated);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connection_error', handleConnectionError);
      socket.off('disconnect', handleDisconnect);
      socket.off('booking_created', handleBookingCreated);
      disconnectSocket();
    };
  }, [role, spaceId, addBooking]);

  const visibleItems = NAV_ITEMS.filter(
    (item) => role && item.roles.includes(role),
  );

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-slate-900 text-white p-4 flex flex-col gap-2">
        <div className="text-lg font-semibold mb-4">
          Coworking SaaS
        </div>

        {role ? (
          <>
            <div className="text-xs text-slate-400 mb-2">
              Signed in as {role}
            </div>

            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 rounded hover:bg-slate-700 text-sm"
              >
                {item.label}
              </Link>
            ))}
          </>
        ) : (
          <div className="text-sm text-slate-400">
            Not signed in
          </div>
        )}
      </aside>

      <main className="flex-1 bg-slate-50 p-6">
        {children}
      </main>
    </div>
  );
}
