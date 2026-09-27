'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthHeaders, getPublicSpaces, joinSpace, type PublicSpace } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { useAuthStore } from '@/store/authStore';
import { 
  Building2, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  ArrowRight,
  Users,
  MapPin,
  CalendarDays,
  ChevronRight,
  LayoutGrid,
  Search,
  DoorOpen,
} from 'lucide-react';

interface Space {
  id: string;
  name: string;
  slug: string;
  deletedAt?: string | null;
}

// Real per-space numbers (these cards used to show a hard-coded
// "24 members / 12 desks / 8 rooms" for every space).
//  - Platform admin: from GET /admin/overview (members, desks, rooms).
//  - Manager / member: their own space, counted from /zones, /desks, /rooms.
interface SpaceStats {
  first: { label: 'Members' | 'Zones'; value: number };
  desks: number;
  rooms: number;
}

export default function SpacesPage() {
  const role = useAuthStore((s) => s.role);
  const authSpaceId = useAuthStore((s) => s.spaceId);

  // Signup no longer assigns a Member a space at all (see the signup
  // page) — this is where they pick one instead. Render this BEFORE
  // any of the /spaces/me fetching below even starts: that endpoint
  // 403s for a spaceless Member (TenantGuard has nothing to scope to),
  // so there's no point spinning a loader first.
  if (role === 'MEMBER' && !authSpaceId) {
    return <BrowseAndJoinSpaces />;
  }

  return <MySpaces role={role} />;
}

// A Member with no space yet browses every live space on the platform
// and picks one. GET /spaces/public is the same endpoint the signup
// page used to call before a space choice was removed from signup
// entirely — now it's reused here, post-signup, for exactly the "view
// all available spaces" browsing experience that replaces it.
function BrowseAndJoinSpaces() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  const [spaces, setSpaces] = useState<PublicSpace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSpaces(await getPublicSpaces());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load spaces');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function handleJoin(spaceId: string) {
    setJoiningId(spaceId);
    setJoinError(null);
    try {
      const result = await joinSpace(spaceId);
      // The old token still carries spaceId: null — replace it with
      // the fresh one join() returns before navigating anywhere that
      // depends on the new spaceId (every tenant-scoped route does).
      setAuth({
        token: result.accessToken,
        role: result.user.role,
        spaceId: result.user.spaceId,
        userId: result.user.id,
      });
      router.push(`/dashboard/spaces/${spaceId}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join that space');
      setJoiningId(null);
    }
  }

  const filtered = (spaces ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Building2 className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Browse Spaces</h1>
          <p className="text-sm text-slate-500">Pick a space to join</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search spaces..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg
                   text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                   focus:border-transparent"
        />
      </div>

      {joinError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg max-w-md">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{joinError}</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
          <p className="text-sm text-slate-500">Loading spaces...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-red-800 mb-1">Failed to Load Spaces</h2>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={load}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600
                         text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-4 bg-slate-100 rounded-full mb-4">
            <Building2 className="w-12 h-12 text-slate-300" />
          </div>
          <p className="text-sm text-slate-500">
            {spaces && spaces.length > 0 ? 'No spaces match that search.' : 'No spaces are listed yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((space) => (
            <div
              key={space.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">
                    {space.priceCents != null ? formatCents(space.priceCents) : 'Price varies'}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 text-lg">{space.name}</h3>
              </div>

              <div className="px-6 py-4 bg-slate-50">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <Users className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">{space.members}</div>
                    <div className="text-[10px] text-slate-400">Members</div>
                  </div>
                  <div>
                    <LayoutGrid className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">{space.desks}</div>
                    <div className="text-[10px] text-slate-400">Desks</div>
                  </div>
                  <div>
                    <DoorOpen className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">{space.rooms}</div>
                    <div className="text-[10px] text-slate-400">Rooms</div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-3">
                <button
                  onClick={() => handleJoin(space.id)}
                  disabled={joiningId !== null}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-900
                           hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium
                           rounded-lg transition-colors"
                >
                  {joiningId === space.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  Join this space
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MySpaces({ role }: { role: string | null }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  // Only the newest request may write state. Without this, a slow earlier
  // request (e.g. one made before the role was known) can finish AFTER the
  // right one and overwrite it with its error.
  const requestSeq = useRef(0);
  const [stats, setStats] = useState<Record<string, SpaceStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSpaces = async (showLoading = true) => {
    const seq = ++requestSeq.current;
    const isCurrent = () => seq === requestSeq.current;
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    
    try {
      const endpoint = role === 'PLATFORM_ADMIN' ? '/spaces' : '/spaces/me';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      
      if (!res.ok) {
        throw new Error(`Failed to fetch spaces (${res.status})`);
      }
      
      const data = await res.json();
      if (!isCurrent()) return;
      const list: Space[] = Array.isArray(data) ? data : data ? [data] : [];
      setSpaces(list);

      // Numbers are a nicety: if they fail to load the cards still work.
      try {
        const base = process.env.NEXT_PUBLIC_API_URL;
        const next: Record<string, SpaceStats> = {};
        if (role === 'PLATFORM_ADMIN') {
          const r = await fetch(`${base}/admin/overview`, { headers: getAuthHeaders(), cache: 'no-store' });
          if (r.ok) {
            const overview: { perSpace: { id: string; members: number; desks: number; rooms: number }[] } = await r.json();
            for (const row of overview.perSpace) {
              next[row.id] = { first: { label: 'Members', value: row.members }, desks: row.desks, rooms: row.rooms };
            }
          }
        } else if (list[0]) {
          const [z, d, rm] = await Promise.all(
            ['zones', 'desks', 'rooms'].map((p) =>
              fetch(`${base}/${p}`, { headers: getAuthHeaders(), cache: 'no-store' }),
            ),
          );
          if (z.ok && d.ok && rm.ok) {
            next[list[0].id] = {
              first: { label: 'Zones', value: (await z.json()).length },
              desks: (await d.json()).length,
              rooms: (await rm.json()).length,
            };
          }
        }
        if (isCurrent()) setStats(next);
      } catch {
        if (isCurrent()) setStats({});
      }
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Failed to load spaces');
      setSpaces([]);
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    // The persisted auth store hydrates a moment after first render. Fetching
    // while `role` is still null used to hit /spaces/me with an admin token
    // (a 500), so wait until we know who is asking.
    if (!role) {
      // Genuinely signed out (no route guard exists yet): say so instead of
      // spinning forever.
      const t = setTimeout(() => {
        setLoading(false);
        setError('You are not signed in.');
      }, 1500);
      return () => clearTimeout(t);
    }
    fetchSpaces();
  }, [role]);

  const filteredSpaces = spaces.filter(space => 
    space.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    space.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading spaces...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-red-800 mb-1">
                Failed to Load Spaces
              </h2>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => fetchSpaces()}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 
                         text-white text-sm font-medium rounded-lg hover:bg-red-700 
                         transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Spaces</h1>
            <p className="text-sm text-slate-500">
              {role === 'PLATFORM_ADMIN'
                ? 'All available spaces'
                : role === 'SPACE_MANAGER'
                  ? 'Your managed space'
                  : 'The space you joined'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchSpaces(false)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 
                     rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 
                     hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          {/* "New Space" removed: under the current model a Space
              Manager is tied to exactly one space, set at signup —
              there's no backend support for creating a second one
              (POST /spaces is PLATFORM_ADMIN-only), and this button
              pointed at a page that was never built (fell through to
              the [spaceId] dynamic route with the literal string
              "new" as the id). Revisit if/when multi-space management
              per manager is actually built. */}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search spaces..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg 
                   text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 
                   focus:border-transparent"
        />
      </div>

      {filteredSpaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-4 bg-slate-100 rounded-full mb-4">
            <Building2 className="w-12 h-12 text-slate-300" />
          </div>
          <p className="text-sm text-slate-500">No spaces found.</p>
          {searchTerm && (
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your search
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSpaces.map((space) => (
            <Link
              key={space.id}
              href={`/dashboard/spaces/${space.id}`}
              className="group bg-white rounded-xl border border-slate-200 shadow-sm 
                       hover:shadow-lg hover:border-slate-300 transition-all duration-200 
                       overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 
                                       transition-transform group-hover:translate-x-1" />
                </div>
                
                <h3 className="font-semibold text-slate-900 text-lg mb-1 
                             group-hover:text-blue-600 transition-colors">
                  {space.name}
                </h3>
                <p className="text-sm text-slate-500">/{space.slug}</p>
              </div>

              <div className="px-6 py-4 bg-slate-50">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <Users className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">{stats[space.id]?.first.value ?? '–'}</div>
                    <div className="text-[10px] text-slate-400">{stats[space.id]?.first.label ?? 'Members'}</div>
                  </div>
                  <div>
                    <LayoutGrid className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">{stats[space.id]?.desks ?? '–'}</div>
                    <div className="text-[10px] text-slate-400">Desks</div>
                  </div>
                  <div>
                    <CalendarDays className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">{stats[space.id]?.rooms ?? '–'}</div>
                    <div className="text-[10px] text-slate-400">Rooms</div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="w-3 h-3" />
                  <span>{space.deletedAt ? 'Closed' : 'Active'}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 
                               opacity-0 group-hover:opacity-100 transition-opacity">
                  View Details
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}