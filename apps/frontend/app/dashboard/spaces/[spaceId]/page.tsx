'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { 
  Building2, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  ArrowLeft,
  MapPin,
  Users,
  LayoutGrid,
  CalendarDays,
  ChevronRight,
  Plus,
  Info,
  Lock,
  Globe
} from 'lucide-react';

interface Zone {
  id: string;
  name: string;
}

interface SpaceInfo {
  id: string;
  name: string;
  slug: string;
}

export default function SpaceDetailPage() {
  const { spaceId: routeSpaceId } = useParams<{ spaceId: string }>();
  const ownSpaceId = useAuthStore((s) => s.spaceId);
  const role = useAuthStore((s) => s.role);
  const router = useRouter();

  const [space, setSpace] = useState<SpaceInfo | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isOwnSpace = ownSpaceId === routeSpaceId;

  const fetchSpaceAndZones = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    
    try {
      const base = process.env.NEXT_PUBLIC_API_URL;

      const spaceRes = await fetch(`${base}/spaces/me`, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      
      if (!spaceRes.ok) {
        throw new Error(`Failed to load space (${spaceRes.status})`);
      }
      
      setSpace(await spaceRes.json());

      const zonesRes = await fetch(`${base}/zones`, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      
      if (!zonesRes.ok) {
        throw new Error(
          zonesRes.status === 403
            ? 'Zone details are not available to this role yet.'
            : `Failed to load zones (${zonesRes.status})`
        );
      }
      
      setZones(await zonesRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!routeSpaceId) return;

    if (isOwnSpace) {
      fetchSpaceAndZones();
    } else {
      setLoading(false);
      setError(
        "This backend has no endpoint for viewing another space's details — only your own. " +
        "Platform Admin access is currently limited."
      );
    }
  }, [routeSpaceId, isOwnSpace]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading space details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            {error.includes('403') || error.includes('role') ? (
              <Lock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            )}
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-amber-800 mb-1">
                Access Limited
              </h2>
              <p className="text-sm text-amber-700">{error}</p>
              <button
                onClick={() => router.push('/dashboard/spaces')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 
                         text-white text-sm font-medium rounded-lg hover:bg-amber-700 
                         transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Spaces
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Building2 className="w-12 h-12 text-slate-300 mb-4" />
        <p className="text-sm text-slate-500">Space not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <button
        onClick={() => router.push('/dashboard/spaces')}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 
                 mb-2 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back to Spaces
      </button>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-700/50 rounded-lg">
                <Building2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">{space.name}</h1>
                <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                  <Globe className="w-3.5 h-3.5" />
                  /{space.slug}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => fetchSpaceAndZones(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50 
                       text-white rounded-lg text-sm font-medium hover:bg-slate-700 
                       transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
          <div className="text-center">
            <div className="p-2 bg-blue-50 rounded-lg inline-flex mb-2">
              <LayoutGrid className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{zones.length}</div>
            <div className="text-xs text-slate-500">Total Zones</div>
          </div>
          <div className="text-center">
            <div className="p-2 bg-green-50 rounded-lg inline-flex mb-2">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">24</div>
            <div className="text-xs text-slate-500">Members</div>
          </div>
          <div className="text-center">
            <div className="p-2 bg-purple-50 rounded-lg inline-flex mb-2">
              <MapPin className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">12</div>
            <div className="text-xs text-slate-500">Active Zones</div>
          </div>
          <div className="text-center">
            <div className="p-2 bg-amber-50 rounded-lg inline-flex mb-2">
              <CalendarDays className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">87%</div>
            <div className="text-xs text-slate-500">Utilization</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <LayoutGrid className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Zones</h2>
              <p className="text-sm text-slate-500">
                {zones.length} {zones.length === 1 ? 'zone' : 'zones'} available
              </p>
            </div>
          </div>
          
          {role === 'SPACE_MANAGER' && (
            <button
              onClick={() => router.push('/dashboard/zones/new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 
                       text-white rounded-lg text-sm font-medium hover:bg-slate-800 
                       transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Zone
            </button>
          )}
        </div>

        {zones.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map((zone) => (
              <Link
                key={zone.id}
                href={`/dashboard/zones/${zone.id}`}
                className="group bg-white border-2 border-slate-200 rounded-xl p-5 
                         hover:border-blue-500 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2.5 bg-slate-50 rounded-lg group-hover:bg-blue-50 
                                transition-colors">
                    <MapPin className="w-5 h-5 text-slate-600 group-hover:text-blue-600 
                                     transition-colors" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 
                                       transition-transform group-hover:translate-x-1" />
                </div>
                
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-blue-600 
                             transition-colors">
                  {zone.name}
                </h3>
                
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <LayoutGrid className="w-3 h-3" />
                    8 Desks
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    3 Rooms
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-slate-100 rounded-full mb-4">
              <MapPin className="w-12 h-12 text-slate-300" />
            </div>
            <p className="text-sm text-slate-500 mb-1">No zones in this space yet.</p>
            {role === 'SPACE_MANAGER' && (
              <button
                onClick={() => router.push('/dashboard/zones/new')}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-slate-900 
                         text-white rounded-lg text-sm font-medium hover:bg-slate-800 
                         transition-all"
              >
                <Plus className="w-4 h-4" />
                Create First Zone
              </button>
            )}
          </div>
        )}
      </div>

      {role === 'PLATFORM_ADMIN' && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              Platform Admin View
            </h3>
            <p className="text-sm text-blue-700">
              You're viewing this space with limited access. Some features may be 
              restricted based on your role.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}