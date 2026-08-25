'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBookingStore, BookableType } from '@/store/bookingStore';
import DateCalendar from '@/components/DateCalendar';
import {
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  CalendarDays,
  Info,
  Zap,
} from 'lucide-react';

// Click-to-pick start times, every 30 minutes across a full day.
// Coworking spaces don't have a universal "business hours" assumption
// built in anywhere else in this app (bookings.service.ts doesn't
// restrict by time of day), so this offers the full range rather than
// arbitrarily narrowing it — just makes clicking through 48 slots fast
// via the compact grid below instead of a long dropdown.
const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});

const DURATION_OPTIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
  { label: '8 hours', minutes: 480 },
];

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// Combines a calendar date with an "HH:mm" string into a local-time
// Date object — same local-time semantics the old datetime-local input
// had (new Date(year, month, day, hour, minute) is local, not UTC).
function combineDateAndTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(h, m, 0, 0);
  return combined;
}

export default function BookResourcePage() {
  const { bookableType, bookableId } = useParams<{ bookableType: string; bookableId: string }>();
  const router = useRouter();

  const setDraftResource = useBookingStore((s) => s.setDraftResource);
  const setDraftTimes = useBookingStore((s) => s.setDraftTimes);
  const submitBooking = useBookingStore((s) => s.submitBooking);
  const isSubmitting = useBookingStore((s) => s.isSubmitting);
  const error = useBookingStore((s) => s.error);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [startSlot, setStartSlot] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  // Derived start/end — the same values the old typed inputs used to
  // produce, just built from clicks instead of keystrokes.
  const { startDate, endDate } = useMemo(() => {
    if (!selectedDate || !startSlot || durationMinutes === null) {
      return { startDate: null as Date | null, endDate: null as Date | null };
    }
    const s = combineDateAndTime(selectedDate, startSlot);
    const e = new Date(s.getTime() + durationMinutes * 60 * 1000);
    return { startDate: s, endDate: e };
  }, [selectedDate, startSlot, durationMinutes]);

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

  function validateSelection(): boolean {
    if (!startDate || !endDate) {
      setValidationError('Pick a date, start time, and duration.');
      return false;
    }
    if (startDate.getTime() < now.getTime()) {
      setValidationError('That start time has already passed — pick a later slot.');
      return false;
    }
    const duration = endDate.getTime() - startDate.getTime();
    if (duration > 24 * 60 * 60 * 1000) {
      setValidationError('Booking cannot exceed 24 hours.');
      return false;
    }
    setValidationError(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConflict(false);

    if (!validateSelection() || !startDate || !endDate) {
      return;
    }

    setDraftResource(bookableType.toUpperCase() as BookableType, bookableId);
    setDraftTimes(startDate.toISOString(), endDate.toISOString());

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

  // A start slot on today counts as "already passed" once its time is
  // behind the current clock — greys it out in the grid below rather
  // than letting someone pick it and only finding out on submit.
  const isSlotDisabled = (hhmm: string): boolean => {
    if (!selectedDate) return true;
    const candidate = combineDateAndTime(selectedDate, hhmm);
    return candidate.getTime() < now.getTime();
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
                  Pick a date, a start time, and how long you need it
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                Date
              </label>
              <DateCalendar
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  // Changing the date can un-disable or re-disable the
                  // currently chosen start slot (e.g. "now" moved past
                  // it) — clear it so the user re-confirms explicitly
                  // rather than silently keeping a now-invalid pick.
                  setStartSlot(null);
                }}
              />
            </div>

            {selectedDate && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Start time
                </label>
                <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto border-2 border-slate-200 rounded-lg p-2">
                  {TIME_SLOTS.map((slot) => {
                    const disabled = isSlotDisabled(slot);
                    const selected = startSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={disabled}
                        onClick={() => setStartSlot(slot)}
                        className={`
                          text-xs py-1.5 rounded transition-colors
                          ${disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-blue-50 cursor-pointer'}
                          ${selected ? 'bg-blue-600 text-white hover:bg-blue-600 font-semibold' : ''}
                        `}
                      >
                        {formatTimeLabel(slot)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedDate && startSlot && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Duration
                </label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_OPTIONS.map((opt) => {
                    const selected = durationMinutes === opt.minutes;
                    return (
                      <button
                        key={opt.minutes}
                        type="button"
                        onClick={() => setDurationMinutes(opt.minutes)}
                        className={`
                          px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors
                          ${selected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-blue-300'}
                        `}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {startDate && endDate && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  {startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}
                  {startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  {' – '}
                  {endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )}

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
                Maximum booking duration is 24 hours.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !startDate || !endDate}
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
