'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore, Role } from '@/store/authStore';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface NavItem {
  label: string;
  href: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'All Spaces',
    href: '/dashboard/spaces',
    roles: ['PLATFORM_ADMIN'],
  },
  {
    label: 'My Space',
    href: '/dashboard/spaces',
    roles: ['SPACE_MANAGER'],
  },
  {
    label: 'Bookings',
    href: '/dashboard/bookings',
    roles: ['MEMBER', 'SPACE_MANAGER'],
  },
  {
    label: 'Manage Zones',
    href: '/dashboard/zones',
    roles: ['SPACE_MANAGER'],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = useAuthStore((state) => state.role);
  const spaceId = useAuthStore((state) => state.spaceId);
  const token = useAuthStore((state) => state.token);

  const visibleItems = NAV_ITEMS.filter(
    (item) => role && item.roles.includes(role),
  );

  useEffect(() => {
    // A socket connection requires all tenant-scoped authentication data.
    // Platform admins may not have a spaceId, so they do not connect.
    if (!token || !spaceId || !role) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(token, spaceId, role);

    if (!socket) {
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

    const handleBookingCreated = (payload: unknown) => {
      console.log('[Realtime] booking_created:', payload);

      // The booking event is intentionally only logged at this stage.
      // Individual dashboard pages can subscribe to the shared socket
      // later and refresh their own data.
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
  }, [token, spaceId, role]);

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