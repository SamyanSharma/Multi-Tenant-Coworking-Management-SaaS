import { describe, it, expect } from 'vitest';
import {
  intervalsOverlap,
  isRangeOccupied,
  isDayFullyOccupied,
} from '../availability';

function d(iso: string): Date {
  return new Date(iso);
}

describe('intervalsOverlap', () => {
  it('detects a genuine overlap', () => {
    expect(
      intervalsOverlap(
        d('2026-09-20T09:00:00'),
        d('2026-09-20T11:00:00'),
        d('2026-09-20T10:00:00'),
        d('2026-09-20T12:00:00'),
      ),
    ).toBe(true);
  });

  it('treats back-to-back (touching, not overlapping) ranges as NOT overlapping', () => {
    expect(
      intervalsOverlap(
        d('2026-09-20T09:00:00'),
        d('2026-09-20T10:00:00'),
        d('2026-09-20T10:00:00'),
        d('2026-09-20T11:00:00'),
      ),
    ).toBe(false);
  });

  it('detects one range fully containing another as overlapping', () => {
    expect(
      intervalsOverlap(
        d('2026-09-20T09:00:00'),
        d('2026-09-20T17:00:00'),
        d('2026-09-20T12:00:00'),
        d('2026-09-20T13:00:00'),
      ),
    ).toBe(true);
  });

  it('returns false for ranges nowhere near each other', () => {
    expect(
      intervalsOverlap(
        d('2026-09-20T09:00:00'),
        d('2026-09-20T10:00:00'),
        d('2026-09-21T09:00:00'),
        d('2026-09-21T10:00:00'),
      ),
    ).toBe(false);
  });
});

describe('isRangeOccupied', () => {
  const occupied = [
    { start: d('2026-09-20T09:00:00'), end: d('2026-09-20T10:00:00') },
    { start: d('2026-09-20T14:00:00'), end: d('2026-09-20T15:00:00') },
  ];

  it('returns true when the candidate range overlaps any occupied interval', () => {
    expect(
      isRangeOccupied(
        d('2026-09-20T09:30:00'),
        d('2026-09-20T09:45:00'),
        occupied,
      ),
    ).toBe(true);
  });

  it('returns false when the candidate range fits in a genuine gap', () => {
    expect(
      isRangeOccupied(
        d('2026-09-20T10:30:00'),
        d('2026-09-20T13:30:00'),
        occupied,
      ),
    ).toBe(false);
  });

  it('returns false against an empty occupied list', () => {
    expect(
      isRangeOccupied(
        d('2026-09-20T09:00:00'),
        d('2026-09-20T10:00:00'),
        [],
      ),
    ).toBe(false);
  });
});

describe('isDayFullyOccupied', () => {
  it('returns false when there is a free gap anywhere in the day', () => {
    const occupied = [
      { start: d('2026-09-20T00:00:00'), end: d('2026-09-20T08:00:00') },
      { start: d('2026-09-20T09:00:00'), end: d('2026-09-20T23:59:59') },
    ];
    // there's a real gap 08:00-09:00
    expect(isDayFullyOccupied(d('2026-09-20T00:00:00'), occupied)).toBe(false);
  });

  it('returns true when merged bookings cover the entire day with no gap', () => {
    const occupied = [
      { start: d('2026-09-19T22:00:00'), end: d('2026-09-20T12:00:00') }, // spills in from previous day
      { start: d('2026-09-20T12:00:00'), end: d('2026-09-21T02:00:00') }, // spills into next day
    ];
    expect(isDayFullyOccupied(d('2026-09-20T00:00:00'), occupied)).toBe(true);
  });

  it('returns false for a day with no bookings at all', () => {
    expect(isDayFullyOccupied(d('2026-09-20T00:00:00'), [])).toBe(false);
  });

  it('ignores bookings on unrelated days entirely', () => {
    const occupied = [
      { start: d('2026-09-19T00:00:00'), end: d('2026-09-19T23:59:59') },
      { start: d('2026-09-21T00:00:00'), end: d('2026-09-21T23:59:59') },
    ];
    expect(isDayFullyOccupied(d('2026-09-20T00:00:00'), occupied)).toBe(false);
  });

  it('handles unsorted, overlapping-with-each-other input intervals correctly', () => {
    const occupied = [
      { start: d('2026-09-20T18:00:00'), end: d('2026-09-21T00:00:00') },
      { start: d('2026-09-20T00:00:00'), end: d('2026-09-20T10:00:00') },
      { start: d('2026-09-20T08:00:00'), end: d('2026-09-20T18:00:00') }, // overlaps the first two
    ];
    expect(isDayFullyOccupied(d('2026-09-20T00:00:00'), occupied)).toBe(true);
  });
});
