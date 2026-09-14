'use client';

import { useEffect, useRef } from 'react';

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = ['00', '15', '30', '45'] as const;
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

interface TimeDropdownPickerProps {
  // "HH:mm" 24h string, or null before the user/default has set one.
  value: string | null;
  onChange: (hhmm: string) => void;
  // Composed and reported via onChange once, on mount, if value is
  // still null — so the dropdowns' displayed value and the parent's
  // actual committed state can never silently disagree (a plain
  // uncontrolled-looking default without this would show e.g. "9:00
  // AM" while the parent still thinks nothing has been picked yet).
  defaultValue?: string;
  // Shown inline below the dropdowns when the currently selected
  // combination isn't actually valid (in the past, or overlapping an
  // existing booking) — native <select> can't gray out individual
  // options based on a live combination of three separate dropdowns,
  // so this app surfaces it as feedback instead, the same pattern
  // widely-used SaaS schedulers (e.g. Calendly) use for free-form
  // time entry.
  warning?: string | null;
  disabled?: boolean;
}

export default function TimeDropdownPicker({
  value,
  onChange,
  defaultValue = '09:00',
  warning,
  disabled = false,
}: TimeDropdownPickerProps) {
  const hasAppliedDefault = useRef(false);

  useEffect(() => {
    if (value === null && !hasAppliedDefault.current) {
      hasAppliedDefault.current = true;
      onChange(defaultValue);
    }
  }, [value, defaultValue, onChange]);

  const parts = from24h(value ?? defaultValue);

  function update(next: Partial<Parts>) {
    onChange(to24h({ ...parts, ...next }));
  }

  const selectClass =
    'px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ' +
    (warning ? 'border-amber-300' : 'border-slate-300');

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          aria-label="Hour"
          value={parts.hour12}
          disabled={disabled}
          onChange={(e) => update({ hour12: Number(e.target.value) })}
          className={selectClass}
        >
          {HOURS_12.map((h) => (
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
          onChange={(e) =>
            update({ minute: e.target.value as Parts['minute'] })
          }
          className={selectClass}
        >
          {MINUTES.map((m) => (
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
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      {warning && (
        <p className="text-xs text-amber-700 mt-1.5">{warning}</p>
      )}
    </div>
  );
}
