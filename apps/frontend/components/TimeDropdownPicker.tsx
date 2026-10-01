'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = ['00', '15', '30', '45'] as const;
const PERIODS: Period[] = ['AM', 'PM'];
type Period = 'AM' | 'PM';

export interface Parts {
  hour12: number;
  minute: (typeof MINUTES)[number];
  period: Period;
}

export function to24h({ hour12, minute, period }: Parts): string {
  const h24 = period === 'AM' ? hour12 % 12 : (hour12 % 12) + 12;
  return `${String(h24).padStart(2, '0')}:${minute}`;
}

export function from24h(hhmm: string): Parts {
  const [hStr, minuteStr] = hhmm.split(':');
  const h = Number(hStr);
  const period: Period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minute = MINUTES.includes(minuteStr as Parts['minute'])
    ? (minuteStr as Parts['minute'])
    : '00';
  return { hour12, minute, period };
}

// Given a fixed hour12+period, which of the 4 minute options are
// actually pickable. Checks every minute independently (not just the
// currently-selected one) — this is the piece a previous attempt at
// this component got wrong: it disabled an hour based only on
// whether the CURRENTLY selected minute paired with it, so e.g.
// picking hour=9 while minute happened to be an invalid pairing hid
// hour 9 entirely, even though 9:15/9:30/9:45 might have been fine.
export function minutesFor(
  hour12: number,
  period: Period,
  isValid: (hhmm: string) => boolean,
): Parts['minute'][] {
  return MINUTES.filter((m) => isValid(to24h({ hour12, minute: m, period })));
}

// Which hours have at least one valid minute for the given period.
export function hoursFor(
  period: Period,
  isValid: (hhmm: string) => boolean,
): number[] {
  return HOURS_12.filter((h) => minutesFor(h, period, isValid).length > 0);
}

// Which periods have at least one valid hour+minute combination.
export function periodsFor(isValid: (hhmm: string) => boolean): Period[] {
  return PERIODS.filter((p) => hoursFor(p, isValid).length > 0);
}

interface TimeDropdownPickerProps {
  // "HH:mm" 24h string, or null before the user/default has set one.
  value: string | null;
  onChange: (hhmm: string) => void;
  // Composed and reported via onChange once, on mount, if value is
  // still null — so the dropdowns' displayed value and the parent's
  // actual committed state can never silently disagree.
  defaultValue?: string;
  // Which "HH:mm" values are actually pickable — e.g. not in the
  // past, doesn't overlap an existing booking. Each dropdown only
  // lists options reachable through SOME still-valid combination of
  // the other two (cascading, like a real scheduler) instead of
  // showing every option and graying some out — removed entirely, so
  // there's nothing to click through to find out it doesn't work.
  isValid?: (hhmm: string) => boolean;
  disabled?: boolean;
}

const ALWAYS_VALID = () => true;

export default function TimeDropdownPicker({
  value,
  onChange,
  defaultValue = '09:00',
  isValid = ALWAYS_VALID,
  disabled = false,
}: TimeDropdownPickerProps) {
  const hasAppliedDefault = useRef(false);

  // On first mount (or whenever the set of valid times shifts under
  // us — e.g. the person picks a different start date), make sure
  // whatever's displayed is something actually pickable rather than
  // silently defaulting to an invalid time.
  useEffect(() => {
    if (value !== null && isValid(value)) return;

    const fallback = pickFirstValid(defaultValue, isValid);
    if (fallback && fallback !== value) {
      hasAppliedDefault.current = true;
      onChange(fallback);
    }
    // Only re-run when the identity of `isValid` changes (the parent
    // is expected to memoize it per relevant dependency, e.g. per
    // selected date) — not on every value/onChange render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid]);

  const parts = from24h(value ?? defaultValue);

  const availablePeriods = periodsFor(isValid);
  const availableHours = hoursFor(parts.period, isValid);
  const availableMinutes = minutesFor(parts.hour12, parts.period, isValid);

  const noAvailabilityAtAll = availablePeriods.length === 0;

  function update(next: Partial<Parts>) {
    let candidate: Parts = { ...parts, ...next };

    // Snap any field that fell out of validity as a result of this
    // change to the nearest still-valid option, so the dropdowns
    // never end up silently sitting on an invalid combination.
    const periodOptions = periodsFor(isValid);
    if (!periodOptions.includes(candidate.period) && periodOptions.length) {
      candidate = { ...candidate, period: periodOptions[0] };
    }

    const hourOptions = hoursFor(candidate.period, isValid);
    if (!hourOptions.includes(candidate.hour12) && hourOptions.length) {
      candidate = { ...candidate, hour12: hourOptions[0] };
    }

    const minuteOptions = minutesFor(candidate.hour12, candidate.period, isValid);
    if (!minuteOptions.includes(candidate.minute) && minuteOptions.length) {
      candidate = { ...candidate, minute: minuteOptions[0] };
    }

    onChange(to24h(candidate));
  }

  const selectClass =
    'px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed';

  if (noAvailabilityAtAll) {
    return (
      <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
        <AlertCircle className="w-4 h-4 shrink-0" />
        No available times on this day.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Hour"
        value={parts.hour12}
        disabled={disabled}
        onChange={(e) => update({ hour12: Number(e.target.value) })}
        className={selectClass}
      >
        {availableHours.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>

      <span className="text-slate-400 font-medium">:</span>

      <select
        aria-label="Minute"
        value={parts.minute}
        disabled={disabled}
        onChange={(e) => update({ minute: e.target.value as Parts['minute'] })}
        className={selectClass}
      >
        {availableMinutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        aria-label="AM or PM"
        value={parts.period}
        disabled={disabled}
        onChange={(e) => update({ period: e.target.value as Period })}
        className={selectClass}
      >
        {availablePeriods.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
}

// Returns `preferred` if it's valid, otherwise the first genuinely
// valid "HH:mm" slot in the day (scanning in natural clock order), or
// null if literally nothing is valid.
export function pickFirstValid(
  preferred: string,
  isValid: (hhmm: string) => boolean,
): string | null {
  if (isValid(preferred)) return preferred;

  for (let h = 0; h < 24; h++) {
    for (const m of MINUTES) {
      const candidate = `${String(h).padStart(2, '0')}:${m}`;
      if (isValid(candidate)) return candidate;
    }
  }
  return null;
}
