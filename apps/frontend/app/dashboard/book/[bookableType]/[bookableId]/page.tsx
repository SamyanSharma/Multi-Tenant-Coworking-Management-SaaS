'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBookingStore, BookableType, CreatedBooking } from '@/store/bookingStore';
import { getAuthHeaders } from '@/lib/api';
import {
  BookingInterval,
  isRangeOccupied,
  isDayFullyOccupied,
} from '@/lib/availability';
import DateCalendar from '@/components/DateCalendar';
import TimeDropdownPicker from '@/components/TimeDropdownPicker';
import PaymentStep from '@/components/PaymentStep';
import {
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  CalendarDays,
  Zap,
} from 'lucide-react';

// Combines a calendar date with an "HH:mm" string into a local-time
// Date object — same local-time semantics the old datetime-local input
// had (new Date(year, month, day, hour, minute) is local, not UTC).
function combineDateAndTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(h, m, 0, 0);
  return combined;
}

function formatDateTime(d: Date): string {
  return (
    d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

interface RawBooking {
  bookableId: string;
  startTime: string;
  endTime: string;
  cancelledAt?: string | null;
}

export default function BookResourcePage() {
  const { bookableType, bookableId } = useParams<{ bookableType: string; bookableId: string }>();
  const router = useRouter();

  const setDraftResource = useBookingStore((s) => s.setDraftResource);
  const setDraftTimes = useBookingStore((s) => s.setDraftTimes);
  const submitBooking = useBookingStore((s) => s.submitBooking);
  const isSubmitting = useBookingStore((s) => s.isSubmitting);
  const error = useBookingStore((s) => s.error);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [startSlot, setStartSlot] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [endSlot, setEndSlot] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Set when a booking was created AND needs payment (clientSecret
  // present) — renders the Stripe payment step in place of the form
  // instead of navigating away immediately.
  const [pendingPayment, setPendingPayment] = useState<CreatedBooking | null>(
    null,
  );

  // Existing bookings for THIS resource — fetched once so the
  // calendar/time pickers can reflect real availability up front,
  // instead of only finding out about a conflict from the backend's
  // 409 after submitting. GET /bookings already returns every
  // booking in the space (used elsewhere), so this just filters to
  // the one resource rather than needing a new endpoint.
  const [occupied, setOccupied] = useState<BookingInterval[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailability() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bookings`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) return;

        const all: RawBooking[] = await res.json();
        if (cancelled) return;

        // Every existing booking for this resource occupies its time
        // range regardless of paymentStatus — the backend's exclusion
        // constraint (no_overlapping_bookings) doesn't care whether a
        // booking is UNPAID/PENDING/PAID/FAILED, only that the row
        // exists with that startTime/endTime. Filtering out e.g.
        // FAILED bookings here would show a slot as free that the
        // backend would still reject.
        const intervals = all
          .filter((b) => b.bookableId === bookableId && !b.cancelledAt)
          .map((b) => ({ start: new Date(b.startTime), end: new Date(b.endTime) }));

        setOccupied(intervals);
      } finally {
        if (!cancelled) setLoadingAvailability(false);
      }
    }

    loadAvailability();
    return () => {
      cancelled = true;
    };
  }, [bookableId]);

  const now = useMemo(() => new Date(), []);

  const startDateTime = useMemo(
    () => (startDate && startSlot ? combineDateAndTime(startDate, startSlot) : null),
    [startDate, startSlot],
  );
  const endDateTime = useMemo(
    () => (endDate && endSlot ? combineDateAndTime(endDate, endSlot) : null),
    [endDate, endSlot],
  );

  // Drives which options TimeDropdownPicker actually lists — a start
  // time is valid if it isn't in the past and doesn't land inside an
  // existing booking. New function identity whenever startDate/
  // occupied change is what tells the picker to re-filter and
  // possibly re-pick its default.
  const isStartTimeValid = useCallback(
    (hhmm: string) => {
      if (!startDate) return false;
      const candidate = combineDateAndTime(startDate, hhmm);
      if (candidate.getTime() < now.getTime()) return false;
      return !occupied.some((iv) => candidate >= iv.start && candidate < iv.end);
    },
    [startDate, occupied, now],
  );

  // An end time is valid only if the FULL [start, end) range it would
  // produce doesn't overlap anything — not just the end instant
  // itself. This is what catches "9am-5pm swallows a noon booking"
  // without needing a separate range-conflict banner: an end time
  // that would create that overlap simply never appears as an option.
  const isEndTimeValid = useCallback(
    (hhmm: string) => {
      if (!endDate || !startDateTime) return false;
      const candidate = combineDateAndTime(endDate, hhmm);
      if (candidate.getTime() <= startDateTime.getTime()) return false;
      return !isRangeOccupied(startDateTime, candidate, occupied);
    },
    [endDate, startDateTime, occupied],
  );

  // Defensive fallback only — TimeDropdownPicker's own filtering
  // should make this impossible in normal use, but a stale selection
  // (e.g. someone else books the gap between render and submit) is
  // still worth catching before hitting the backend.
  const rangeConflict =
    startDateTime && endDateTime && endDateTime.getTime() > startDateTime.getTime()
      ? isRangeOccupied(startDateTime, endDateTime, occupied)
      : false;

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

  function handleSelectStartDate(date: Date) {
    setStartDate(date);
    // Changing the start date invalidates whatever start time and end
    // date/time were picked before (the "must be after start" floor
    // just moved) — clear all of it so the user re-confirms explicitly
    // rather than silently keeping a now-invalid combination.
    setStartSlot(null);
    setEndDate(null);
    setEndSlot(null);
  }

  function handleSelectStartSlot(slot: string) {
    setStartSlot(slot);
    setEndDate(null);
    setEndSlot(null);
  }

  function handleSelectEndDate(date: Date) {
    setEndDate(date);
    setEndSlot(null);
  }

  function validateSelection(): boolean {
    if (!startDateTime || !endDateTime) {
      setValidationError('Pick a start date & time and an end date & time.');
      return false;
    }
    if (endDateTime.getTime() <= startDateTime.getTime()) {
      setValidationError('End must be after start.');
      return false;
    }
    if (startDateTime.getTime() < now.getTime()) {
      setValidationError('Start time has already passed — pick a later time.');
      return false;
    }
    if (rangeConflict) {
      setValidationError('This range overlaps an existing booking — pick a different time.');
      return false;
    }
    setValidationError(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConflict(false);

    if (!validateSelection() || !startDateTime || !endDateTime) {
      return;
    }

    setDraftResource(bookableType.toUpperCase() as BookableType, bookableId);
    setDraftTimes(startDateTime.toISOString(), endDateTime.toISOString());

    const created = await submitBooking();

    if (!created) {
      setConflict(true);
      return;
    }

    if (created.clientSecret) {
      // Payment needed — show the Stripe form in place of the booking
      // form rather than navigating away. The booking already exists
      // (PENDING) at this point; only the charge itself is pending.
      setPendingPayment(created);
    } else {
      // No payment needed (e.g. Space Manager hasn't finished Stripe
      // onboarding yet) — booking is UNPAID but complete, nothing
      // further to do here.
      router.push('/dashboard/bookings');
    }
  }

  const handleBack = () => {
    router.back();
  };

  const canSubmit =
    !isSubmitting &&
    !!startDateTime &&
    !!endDateTime &&
    endDateTime.getTime() > startDateTime.getTime() &&
    startDateTime.getTime() >= now.getTime() &&
    !rangeConflict;

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
          {pendingPayment ? (
            <>
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-700/50 rounded-lg text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">
                      Booking confirmed — pay to finish
                    </h1>
                    <p className="text-sm text-slate-400">
                      Your slot is held. Complete payment to lock it in.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <PaymentStep
                  clientSecret={pendingPayment.clientSecret!}
                  amountCents={pendingPayment.amountCents ?? 0}
                  holdExpiresAt={pendingPayment.holdExpiresAt}
                  onPaid={() => router.push('/dashboard/bookings')}
                />
              </div>
            </>
          ) : (
            <>
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
                  Pick when this booking starts and ends
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {loadingAvailability && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking existing bookings...
              </div>
            )}

            {/* Start date */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                Start date
              </label>
              <DateCalendar
                selected={startDate}
                onSelect={handleSelectStartDate}
                isDateDisabled={(date) => isDayFullyOccupied(date, occupied)}
              />
            </div>

            {/* Start time — only genuinely available times are listed */}
            {startDate && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Start time
                </label>
                <TimeDropdownPicker
                  value={startSlot}
                  onChange={handleSelectStartSlot}
                  isValid={isStartTimeValid}
                />
              </div>
            )}

            {/* End date */}
            {startDate && startSlot && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  End date
                </label>
                <DateCalendar
                  selected={endDate}
                  onSelect={handleSelectEndDate}
                  minDate={startDate}
                  isDateDisabled={(date) => isDayFullyOccupied(date, occupied)}
                />
              </div>
            )}

            {/* End time — only options that produce a non-overlapping
                full range are listed, not just a free end instant */}
            {endDate && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  End time
                </label>
                <TimeDropdownPicker
                  value={endSlot}
                  onChange={setEndSlot}
                  defaultValue="10:00"
                  isValid={isEndTimeValid}
                />
              </div>
            )}

            {startDateTime && endDateTime && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  {formatDateTime(startDateTime)} &nbsp;→&nbsp; {formatDateTime(endDateTime)}
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

            <button
              type="submit"
              disabled={!canSubmit}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
