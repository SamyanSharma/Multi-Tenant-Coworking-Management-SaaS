'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';
import ZoneForm from './ZoneForm';
import DeskForm from './DeskForm';
import RoomForm from './RoomForm';
import FloorPlan from '@/components/FloorPlan';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import RenameDialog, { RenameKind } from '@/components/RenameDialog';
import { useLiveBookingsStore } from '@/store/liveBookingsStore';
import { DeletableKind } from '@/lib/deleteFlow';
import { 
  MapPin, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  ArrowLeft,
  LayoutGrid,
  DoorOpen,
  Users,
  Plus,
  Edit3,
  ChevronRight,
  Building2,
  CalendarDays,
  Activity,
  Info,
  Trash2,
} from 'lucide-react';

interface Desk {
  id: string;
  name: string;
  zoneId: string;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
  zoneId: string;
}

interface ZoneDetail {
  id: string;
  name: string;
}

export default function ZoneDetailPage() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const role = useAuthStore((s) => s.role);
  const router = useRouter();
  
  const [zone, setZone] = useState<ZoneDetail | null>(null);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'manage'>('overview');
  // Stage 9: rename / delete of desks, rooms and this zone.
  const [deleteTarget, setDeleteTarget] = useState<{ kind: DeletableKind; id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ kind: RenameKind; id: string; name: string; capacity?: number } | null>(null);
  const lastResourceDeleted = useLiveBookingsStore((s) => s.lastResourceDeleted);
  const seenDeletion = useRef(lastResourceDeleted);
  const [closedNotice, setClosedNotice] = useState<string | null>(null);
  // After the first successful load, later refreshes (after a rename/delete,
  // or a socket event) must NOT blank the page with the full-screen loader:
  // that unmounts everything, including an open dialog, so a person deleting
  // a desk would never see the "Deleted — $25.00 refunded" result.
  const loadedOnce = useRef(false);
  // Lets the socket handler tell "someone else deleted this zone" (redirect)
  // from "I am deleting it right now" (the dialog's Done button navigates).
  const deleteTargetRef = useRef(deleteTarget);
  deleteTargetRef.current = deleteTarget;

  const fetchZoneData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    
    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const [zoneRes, desksRes, roomsRes] = await Promise.all([
        fetch(`${base}/zones/${zoneId}`, { 
          headers: getAuthHeaders(),
          cache: 'no-store'
        }),
        fetch(`${base}/desks`, { 
          headers: getAuthHeaders(),
          cache: 'no-store'
        }),
        fetch(`${base}/rooms`, { 
          headers: getAuthHeaders(),
          cache: 'no-store'
        }),
      ]);

      if (!zoneRes.ok) throw new Error(`Failed to load zone (${zoneRes.status})`);
      if (!desksRes.ok) throw new Error(`Failed to load desks (${desksRes.status})`);
      if (!roomsRes.ok) throw new Error(`Failed to load rooms (${roomsRes.status})`);

      const zoneData: ZoneDetail = await zoneRes.json();
      const allDesks: Desk[] = await desksRes.json();
      const allRooms: Room[] = await roomsRes.json();

      setZone(zoneData);
      setDesks(allDesks.filter((d) => d.zoneId === zoneId));
      setRooms(allRooms.filter((r) => r.zoneId === zoneId));
      loadedOnce.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!zoneId) return;
    fetchZoneData(!loadedOnce.current);
  }, [zoneId, refreshKey]);

  // Real-time: another tab / manager deleted something. (The event that was
  // already in the store when this page mounted is ignored.)
  useEffect(() => {
    const ev = lastResourceDeleted;
    if (!ev || ev === seenDeletion.current) return;
    seenDeletion.current = ev;

    if (ev.type === 'ZONE' && ev.id === zoneId) {
      if (deleteTargetRef.current?.kind === 'zone') return; // my own delete
      setClosedNotice('This zone was just deleted.');
      const t = setTimeout(() => router.replace('/dashboard/zones'), 1800);
      return () => clearTimeout(t);
    }
    // A desk/room of this zone (or any) went away: reload the lists.
    setRefreshKey((k) => k + 1);
  }, [lastResourceDeleted, zoneId, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading zone details...</p>
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
                Failed to Load Zone
              </h2>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => fetchZoneData()}
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

  if (!zone) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <MapPin className="w-12 h-12 text-slate-300 mb-4" />
        <p className="text-sm text-slate-500">Zone not found.</p>
      </div>
    );
  }

  const canManage = role === 'SPACE_MANAGER' || role === 'PLATFORM_ADMIN';
  // Only Space Managers can rename/delete (the API is SPACE_MANAGER-only).
  const isManager = role === 'SPACE_MANAGER';
  const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {closedNotice && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {closedNotice} Taking you back to the zone list…
        </div>
      )}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 
                 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back
      </button>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-700/50 rounded-lg">
                <MapPin className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">{zone.name}</h1>
                <p className="text-sm text-slate-400">Zone ID: {zone.id}</p>
              </div>
            </div>
            
            <button
              onClick={() => fetchZoneData(false)}
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
            <div className="text-2xl font-bold text-slate-900">{desks.length}</div>
            <div className="text-xs text-slate-500">Desks</div>
          </div>
          <div className="text-center">
            <div className="p-2 bg-purple-50 rounded-lg inline-flex mb-2">
              <DoorOpen className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{rooms.length}</div>
            <div className="text-xs text-slate-500">Rooms</div>
          </div>
          <div className="text-center">
            <div className="p-2 bg-green-50 rounded-lg inline-flex mb-2">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalCapacity}</div>
            <div className="text-xs text-slate-500">Total Capacity</div>
          </div>
          <div className="text-center">
            <div className="p-2 bg-amber-50 rounded-lg inline-flex mb-2">
              <Activity className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">Active</div>
            <div className="text-xs text-slate-500">Status</div>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === 'manage'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Manage Zone
          </button>
        </div>
      )}

      {(activeTab === 'overview' || !canManage) && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Floor Plan</h2>
                <p className="text-sm text-slate-500">Visual layout of the zone</p>
              </div>
            </div>
          </div>
          <FloorPlan
            zoneId={zone.id}
            desks={desks}
            rooms={rooms}
            canManage={isManager}
            onRename={(kind, r) => setRenameTarget({ kind, id: r.id, name: r.name, capacity: r.capacity })}
            onDelete={(kind, r) => setDeleteTarget({ kind, id: r.id, name: r.name })}
          />
        </div>
      )}

      {canManage && activeTab === 'manage' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Plus className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Add Desk</h2>
            </div>
            <DeskForm onSuccess={() => setRefreshKey((k) => k + 1)} />
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-50 rounded-lg">
                <DoorOpen className="w-5 h-5 text-purple-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Add Room</h2>
            </div>
            <RoomForm onSuccess={() => setRefreshKey((k) => k + 1)} />
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Edit3 className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Edit Zone</h2>
            </div>
            <ZoneForm
              zoneId={zone.id}
              initialName={zone.name}
              onSuccess={() => setRefreshKey((k) => k + 1)}
            />
          </div>

          {isManager && (
            <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg" data-testid="danger-zone">
              <div className="mb-2 flex items-center gap-3">
                <div className="rounded-lg bg-red-50 p-2">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Delete this zone</h2>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Removes the zone together with all of its desks and rooms. Upcoming bookings are cancelled and
                refunded; past bookings and payment history are kept.
              </p>
              <button
                type="button"
                onClick={() => setDeleteTarget({ kind: 'zone', id: zone.id, name: zone.name })}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete zone…
              </button>
            </div>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          kind={deleteTarget.kind}
          id={deleteTarget.id}
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            const wasZone = deleteTarget.kind === 'zone';
            setDeleteTarget(null);
            if (wasZone) router.push('/dashboard/zones');
            else setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {renameTarget && (
        <RenameDialog
          kind={renameTarget.kind}
          id={renameTarget.id}
          initialName={renameTarget.name}
          initialCapacity={renameTarget.capacity}
          onClose={() => setRenameTarget(null)}
          onSaved={() => {
            setRenameTarget(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {role === 'PLATFORM_ADMIN' && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              Platform Admin View
            </h3>
            <p className="text-sm text-blue-700">
              You have management access to this zone. Changes will affect all users.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}