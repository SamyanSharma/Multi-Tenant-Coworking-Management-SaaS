'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';
import { 
  CalendarDays, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  Clock,
  LayoutGrid,
  DoorOpen,
  User,
  ChevronRight,
  CalendarOff,
  CheckCircle2,
  XCircle,
  Filter
} from 'lucide-react';

interface Booking {
  id: string;
  bookableType: 'DESK' | 'ROOM';
  bookableId: string;
  startTime: string;
  endTime: string;
}

type FilterType = 'all' | 'upcoming' | 'past' | 'desk' | 'room';

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const role = useAuthStore((s) => s.role);

  const fetchBookings = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bookings`, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      
      if (!res.ok) {
        throw new Error(`Failed to load bookings (${res.status})`);
      }
      
      const data: Booking[] = await res.json();
      setBookings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const filterBookings = (bookings: Booking[]) => {
    const now = new Date();
    
    let filtered = bookings;
    
    switch (activeFilter) {
      case 'upcoming':
        filtered = bookings.filter(b => new Date(b.startTime) > now);
        break;
      case 'past':
        filtered = bookings.filter(b => new Date(b.endTime) < now);
        break;
      case 'desk':
        filtered = bookings.filter(b => b.bookableType === 'DESK');
        break;
      case 'room':
        filtered = bookings.filter(b => b.bookableType === 'ROOM');
        break;
    }
    
    if (searchTerm) {
      filtered = filtered.filter(b => 
        b.bookableId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  };

  const getBookingStatus = (booking: Booking) => {
    const now = new Date();
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    
    if (end < now) return 'completed';
    if (start <= now && end >= now) return 'active';
    return 'upcoming';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'upcoming':
        return 'bg-blue-100 text-blue-700';
      case 'completed':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'upcoming':
        return <Clock className="w-3 h-3" />;
      case 'completed':
        return <XCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const formatBookingDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading your bookings...</p>
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
                Failed to Load Bookings
              </h2>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => fetchBookings()}
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

  const filteredBookings = filterBookings(bookings);
  const stats = {
    total: bookings.length,
    upcoming: bookings.filter(b => getBookingStatus(b) === 'upcoming').length,
    active: bookings.filter(b => getBookingStatus(b) === 'active').length,
    completed: bookings.filter(b => getBookingStatus(b) === 'completed').length,
  };

  const filterOptions: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Upcoming', value: 'upcoming' },
    { label: 'Past', value: 'past' },
    { label: 'Desks', value: 'desk' },
    { label: 'Rooms', value: 'room' },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <CalendarDays className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
            <p className="text-sm text-slate-500">
              {role === 'MEMBER' ? 'Your personal bookings' : 'All bookings in your space'}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => fetchBookings(false)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 
                   rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 
                   hover:border-slate-300 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Total Bookings</div>
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Upcoming</div>
          <div className="text-2xl font-bold text-blue-600">{stats.upcoming}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Active Now</div>
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Completed</div>
          <div className="text-2xl font-bold text-slate-600">{stats.completed}</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search bookings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg 
                     text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 
                     focus:border-transparent"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setActiveFilter(option.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeFilter === option.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {filteredBookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <CalendarOff className="w-12 h-12 text-slate-300 mb-4" />
          <p className="text-sm text-slate-500">No bookings found.</p>
          {searchTerm && (
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your search or filters
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBookings.map((booking) => {
            const status = getBookingStatus(booking);
            const statusColor = getStatusColor(status);
            const statusIcon = getStatusIcon(status);
            
            return (
              <div
                key={booking.id}
                className="group bg-white rounded-xl border border-slate-200 shadow-sm 
                         hover:shadow-md transition-all duration-200 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-slate-50 shrink-0">
                    {booking.bookableType === 'DESK' ? (
                      <LayoutGrid className="w-5 h-5 text-blue-600" />
                    ) : (
                      <DoorOpen className="w-5 h-5 text-purple-600" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900 text-sm">
                        {booking.bookableType === 'DESK' ? 'Desk' : 'Room'} {booking.bookableId}
                      </h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                        {statusIcon}
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {formatBookingDate(new Date(booking.startTime))} 
                        <span className="mx-1">→</span>
                        {formatBookingDate(new Date(booking.endTime))}
                      </span>
                    </div>
                  </div>
                  
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 
                                       transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}