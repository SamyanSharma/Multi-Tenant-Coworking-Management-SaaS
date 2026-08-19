'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore, Role } from '@/store/authStore';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useLiveBookingsStore, LiveBooking } from '@/store/liveBookingsStore';

interface NavItem {
  label: string;
  href: string;
  roles: Role[]; // which roles can see this link
}

const NAV_ITEMS: NavItem[] = [
  { label: 'All Spaces', href: '/dashboard/spaces', roles: ['PLATFORM_ADMIN'] },
  { label: 'My Space', href: '/dashboard/spaces', roles: ['SPACE_MANAGER'] },
  { label: 'Bookings', href: '/dashboard/bookings', roles: ['MEMBER', 'SPACE_MANAGER'] },
  { label: 'Manage Zones', href: '/dashboard/zones', roles: ['SPACE_MANAGER'] },
  { label: 'Billing', href: '/dashboard/settings/billing', roles: ['SPACE_MANAGER', 'MEMBER'] },
  { label: 'Analytics', href: '/dashboard/analytics', roles: ['SPACE_MANAGER', 'PLATFORM_ADMIN'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((state) => state.role);
  const spaceId = useAuthStore((state) => state.spaceId);
  const userId = useAuthStore((state) => state.userId);
  const addBooking = useLiveBookingsStore((state) => state.addBooking);
  const removeBooking = useLiveBookingsStore((state) => state.removeBooking);

  // One socket connection for the whole dashboard session, with the
  // booking_created/booking_cancelled listeners registered here rather
  // than per-component — this keeps liveBookingsStore up to date no
  // matter which page is currently mounted (e.g. a booking made while
  // you're on /dashboard/bookings still updates the floor plan's data,
  // so it's correct the moment you navigate to it).
  useEffect(() => {
    if (!role || !spaceId) return; // PLATFORM_ADMIN has no spaceId — no room to join yet

    const socket = connectSocket({ spaceId, userRole: role, userId });

    const handleCreated = (booking: LiveBooking) => addBooking(booking);
    const handleCancelled = ({ id }: { id: string }) => removeBooking(id);

    socket.on('booking_created', handleCreated);
    socket.on('booking_cancelled', handleCancelled);

    return () => {
      socket.off('booking_created', handleCreated);
      socket.off('booking_cancelled', handleCancelled);
      disconnectSocket();
    };
  }, [role, spaceId, userId, addBooking, removeBooking]);

  const visibleItems = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-slate-900 text-white p-4 flex flex-col gap-2">
        <div className="text-lg font-semibold mb-4">Coworking SaaS</div>
        {role ? (
          <>
            <div className="text-xs text-slate-400 mb-2">Signed in as {role}</div>
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
          <div className="text-sm text-slate-400">Not signed in</div>
        )}
      </aside>
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
