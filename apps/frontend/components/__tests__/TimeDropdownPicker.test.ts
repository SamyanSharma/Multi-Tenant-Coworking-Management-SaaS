import { describe, it, expect } from 'vitest';
import { to24h, from24h } from '../TimeDropdownPicker';

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

  it('round-trips every half-hour slot in a day through to24h(from24h(x)) === x', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of ['00', '30'] as const) {
        const original = `${String(h).padStart(2, '0')}:${m}`;
        expect(to24h(from24h(original))).toBe(original);
      }
    }
  });
});
