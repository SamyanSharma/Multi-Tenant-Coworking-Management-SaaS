'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBookingStore, BookableType } from '@/store/bookingStore';
import { 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  ArrowLeft,
  CalendarDays,
  Info,
  Zap
} from 'lucide-react';

export default function BookResourcePage() {
  const { bookableType, bookableId } = useParams<{ bookableType: string; bookableId: string }>();
  const router = useRouter();

  const setDraftResource = useBookingStore((s) => s.setDraftResource);
  const setDraftTimes = useBookingStore((s) => s.setDraftTimes);
  const submitBooking = useBookingStore((s) => s.submitBooking);
  const isSubmitting = useBookingStore((s) => s.isSubmitting);
  const error = useBookingStore((s) => s.error);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [conflict, setConflict] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [minDateTime, setMinDateTime] = useState('');

  useEffect(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setMinDateTime(now.toISOString().slice(0, 16));
  }, []);

  const getBookableIcon = () => {
    switch (bookableType?.toLowerCase()) {
      case 'desk':
        return <Zap className="w-5 h-5" />;
      case 'room':
        return <CalendarDays className="w-5 h-5" />;
      default:
        return <Calendar className="w-5 h-5" />;
    }
  };

  const validateTimes = (startTime: string, endTime: string): boolean => {
    if (!startTime || !endTime) return true;
    
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    if (endDate <= startDate) {
      setValidationError('End time must be after start time');
      return false;
    }
    
    const duration = endDate.getTime() - startDate.getTime();
    const maxDuration = 24 * 60 * 60 * 1000; // 24 hours
    
    if (duration > maxDuration) {
      setValidationError('Booking cannot exceed 24 hours');
      return false;
    }
    
    setValidationError(null);
    return true;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConflict(false);
    setValidationError(null);

    if (!validateTimes(start, end)) {
      return;
    }

    setDraftResource(bookableType.toUpperCase() as BookableType, bookableId);
    setDraftTimes(new Date(start).toISOString(), new Date(end).toISOString());

    const success = await submitBooking();

    if (success) {
      router.push('/dashboard/bookings');
    } else {
      setConflict(true);
    }
  }

  const handleBack = () => {
    router.back();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="max-w-lg mx-auto">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 
                   mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back
        </button>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-700/50 rounded-lg text-emerald-400">
                {getBookableIcon()}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white capitalize">
                  Book {bookableType}
                </h1>
                <p className="text-sm text-slate-400">
                  Reserve your {bookableType} for a specific time slot
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (end) validateTimes(e.target.value, end);
                  }}
                  min={minDateTime}
                  required
                  className="w-full border-2 border-slate-200 rounded-lg px-4 py-2.5 text-sm 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           transition-all"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  End Time
                </label>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    if (start) validateTimes(start, e.target.value);
                  }}
                  min={start || minDateTime}
                  required
                  className="w-full border-2 border-slate-200 rounded-lg px-4 py-2.5 text-sm 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           transition-all"
                />
              </div>
            </div>

            {validationError && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">{validationError}</p>
              </div>
            )}

            {conflict && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800 mb-1">
                    Booking Conflict
                  </p>
                  <p className="text-sm text-red-700">
                    {error ?? 'This slot was just taken. Please pick a different time.'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                Bookings can be made up to 24 hours in advance. Maximum duration is 24 hours.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 
                       text-white rounded-lg px-4 py-3 text-sm font-medium 
                       hover:bg-slate-800 transition-all disabled:opacity-50 
                       disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Booking...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Booking
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}