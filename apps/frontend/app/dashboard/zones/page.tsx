'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { 
  MapPin, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  Plus,
  ArrowRight,
  LayoutGrid,
  CalendarDays,
  Users,
  ChevronRight,
  Search,
  Building2,
  Activity
} from 'lucide-react';

interface Zone {
  id: string;
  name: string;
}

export default function ZonesListPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const role = useAuthStore((s) => s.role);
  const router = useRouter();

  const fetchZones = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/zones`, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      
      if (!res.ok) {
        throw new Error(`Failed to load zones (${res.status})`);
      }
      
      const data: Zone[] = await res.json();
      setZones(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  const filteredZones = zones.filter(zone => 
    zone.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading zones...</p>
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
                Failed to Load Zones
              </h2>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => fetchZones()}
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <MapPin className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Zones</h1>
            <p className="text-sm text-slate-500">
              {zones.length} {zones.length === 1 ? 'zone' : 'zones'} in your space
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchZones(false)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 
                     rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 
                     hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          {role === 'SPACE_MANAGER' && (
            <button
              onClick={() => router.push('/dashboard/zones/new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 
                       text-white rounded-lg text-sm font-medium hover:bg-slate-800 
                       transition-all"
            >
              <Plus className="w-4 h-4" />
              New Zone
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search zones..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg 
                   text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 
                   focus:border-transparent"
        />
      </div>

      {/* Zones Grid */}
      {filteredZones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-4 bg-slate-100 rounded-full mb-4">
            <MapPin className="w-12 h-12 text-slate-300" />
          </div>
          <p className="text-sm text-slate-500 mb-1">
            {searchTerm ? 'No zones match your search.' : 'No zones yet.'}
          </p>
          {!searchTerm && role === 'SPACE_MANAGER' && (
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredZones.map((zone) => (
            <Link
              key={zone.id}
              href={`/dashboard/zones/${zone.id}`}
              className="group bg-white rounded-xl border-2 border-slate-200 shadow-sm 
                       hover:border-blue-500 hover:shadow-lg transition-all duration-200 
                       overflow-hidden"
            >
              {/* Zone Header */}
              <div className="p-6 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 
                                transition-colors">
                    <MapPin className="w-6 h-6 text-blue-600" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 
                                       transition-transform group-hover:translate-x-1" />
                </div>
                
                <h3 className="font-semibold text-slate-900 text-lg mb-1 
                             group-hover:text-blue-600 transition-colors">
                  {zone.name}
                </h3>
                <p className="text-xs text-slate-500">Zone ID: {zone.id.slice(0, 8)}...</p>
              </div>

              {/* Zone Stats */}
              <div className="px-6 py-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <LayoutGrid className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">8</div>
                    <div className="text-[10px] text-slate-400">Desks</div>
                  </div>
                  <div>
                    <Building2 className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">3</div>
                    <div className="text-[10px] text-slate-400">Rooms</div>
                  </div>
                  <div>
                    <Users className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-medium text-slate-700">12</div>
                    <div className="text-[10px] text-slate-400">Users</div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Activity className="w-3 h-3 text-green-500" />
                  <span>Active</span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 
                               opacity-0 group-hover:opacity-100 transition-opacity">
                  View Zone
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