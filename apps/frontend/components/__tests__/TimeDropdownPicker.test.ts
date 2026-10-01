import { describe, it, expect } from 'vitest';
import { to24h, from24h, minutesFor, hoursFor, periodsFor, pickFirstValid } from '../TimeDropdownPicker';

describe('to24h', () => {
  it('converts 12 AM to 00:xx (midnight)', () => {
    expect(to24h({ hour12: 12, minute: '00', period: 'AM' })).toBe('00:00');
  });

  it('converts 12 PM to 12:xx (noon)', () => {
    expect(to24h({ hour12: 12, minute: '30', period: 'PM' })).toBe('12:30');
  });

  it('converts a plain morning hour correctly', () => {
    expect(to24h({ hour12: 9, minute: '00', period: 'AM' })).toBe('09:00');
  });

  it('converts quarter-past correctly', () => {
    expect(to24h({ hour12: 9, minute: '15', period: 'AM' })).toBe('09:15');
  });

  it('converts quarter-to correctly', () => {
    expect(to24h({ hour12: 9, minute: '45', period: 'AM' })).toBe('09:45');
  });

  it('converts a plain afternoon hour correctly', () => {
    expect(to24h({ hour12: 9, minute: '30', period: 'PM' })).toBe('21:30');
  });

  it('converts 11 PM correctly (near end of day)', () => {
    expect(to24h({ hour12: 11, minute: '30', period: 'PM' })).toBe('23:30');
  });
});

describe('from24h', () => {
  it('parses midnight (00:00) as 12 AM', () => {
    expect(from24h('00:00')).toEqual({ hour12: 12, minute: '00', period: 'AM' });
  });

  it('parses noon (12:00) as 12 PM', () => {
    expect(from24h('12:00')).toEqual({ hour12: 12, minute: '00', period: 'PM' });
  });

  it('parses a plain morning time', () => {
    expect(from24h('09:00')).toEqual({ hour12: 9, minute: '00', period: 'AM' });
  });

  it('parses a plain afternoon time', () => {
    expect(from24h('21:30')).toEqual({ hour12: 9, minute: '30', period: 'PM' });
  });

  it('round-trips every 15-minute slot in a day through to24h(from24h(x)) === x', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of ['00', '15', '30', '45'] as const) {
        const original = `${String(h).padStart(2, '0')}:${m}`;
        expect(to24h(from24h(original))).toBe(original);
      }
    }
  });

  it('falls back to :00 for a minute value outside the four allowed increments', () => {
    expect(from24h('09:37')).toEqual({ hour12: 9, minute: '00', period: 'AM' });
  });
});

describe('minutesFor / hoursFor / periodsFor (cascading dropdown filtering)', () => {
  it('minutesFor returns only minutes valid for that exact hour+period', () => {
    // Only 09:15 and 09:45 are "valid" — 09:00 and 09:30 aren't.
    const isValid = (hhmm: string) => hhmm === '09:15' || hhmm === '09:45';
    expect(minutesFor(9, 'AM', isValid)).toEqual(['15', '45']);
  });

  it('minutesFor returns an empty array when no minute is valid for that hour+period', () => {
    const isValid = (hhmm: string) => hhmm === '10:00';
    expect(minutesFor(9, 'AM', isValid)).toEqual([]);
  });

  it('hoursFor only includes hours with at least one valid minute in that period', () => {
    // Only things at 9am and 11am are valid; 10am has nothing valid.
    const isValid = (hhmm: string) => hhmm === '09:00' || hhmm === '11:30';
    expect(hoursFor('AM', isValid)).toEqual([9, 11]);
  });

  // This is the exact bug a previous version of this component had:
  // it disabled an hour by checking ONLY whether the currently-
  // selected minute happened to pair with it, instead of checking
  // whether ANY minute would work. hoursFor must not repeat that —
  // hour 9 has to show up here even though minute "00" specifically
  // is invalid for it, because minute "15" is valid for hour 9.
  it('includes an hour when only a NON-current minute is valid for it (regression: must not check only one minute)', () => {
    const isValid = (hhmm: string) => hhmm === '09:15'; // NOT 09:00
    expect(hoursFor('AM', isValid)).toContain(9);
  });

  it('hoursFor for PM returns empty when everything valid is in AM', () => {
    const isValid = (hhmm: string) => hhmm.endsWith(':00') && Number(hhmm.split(':')[0]) < 12;
    expect(hoursFor('PM', isValid)).toEqual([]);
  });

  it('periodsFor only includes AM/PM when something in that half of the day is valid', () => {
    const isValid = (hhmm: string) => hhmm === '14:00'; // 2:00 PM only
    expect(periodsFor(isValid)).toEqual(['PM']);
  });

  it('periodsFor returns both when the whole day is open', () => {
    expect(periodsFor(() => true)).toEqual(['AM', 'PM']);
  });

  it('periodsFor returns an empty array when literally nothing in the day is valid', () => {
    expect(periodsFor(() => false)).toEqual([]);
  });
});

describe('pickFirstValid', () => {
  it('returns the preferred value when it is already valid', () => {
    expect(pickFirstValid('09:00', () => true)).toBe('09:00');
  });

  it('scans forward from midnight to find the first valid slot when preferred is not valid', () => {
    const isValid = (hhmm: string) => hhmm === '11:30';
    expect(pickFirstValid('09:00', isValid)).toBe('11:30');
  });

  it('returns null when nothing in the entire day is valid', () => {
    expect(pickFirstValid('09:00', () => false)).toBeNull();
  });

  it('picks the earliest valid slot, not just any valid slot, when several exist', () => {
    const isValid = (hhmm: string) => hhmm === '15:00' || hhmm === '03:30';
    expect(pickFirstValid('09:00', isValid)).toBe('03:30');
  });
});
