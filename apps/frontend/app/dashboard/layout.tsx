'use client';

import Link from 'next/link';
import { useAuthStore, Role } from '@/store/authStore';

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
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((state) => state.role);

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
