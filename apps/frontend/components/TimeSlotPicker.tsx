'use client';


export const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});

export function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

interface TimeSlotPickerProps {
  selected: string | null;
  onSelect: (slot: string) => void;
  isDisabled: (slot: string) => boolean;
}

export default function TimeSlotPicker({
  selected,
  onSelect,
  isDisabled,
}: TimeSlotPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto border-2 border-slate-200 rounded-lg p-2">
      {TIME_SLOTS.map((slot) => {
        const disabled = isDisabled(slot);
        const isSelected = selected === slot;
        return (
          <button
            key={slot}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(slot)}
            className={`
              text-xs py-1.5 rounded transition-colors
              ${disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-blue-50 cursor-pointer'}
              ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-600 font-semibold' : ''}
            `}
          >
            {formatTimeLabel(slot)}
          </button>
        );
      })}
    </div>
  );
}
