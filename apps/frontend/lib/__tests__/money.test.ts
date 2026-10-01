import { describe, it, expect } from 'vitest';
import { formatRates } from '../money';

describe('formatRates', () => {
  it('shows both rates', () => {
    expect(formatRates(500, 4000)).toBe('$5.00/hr · $40.00/day');
  });
  it('shows only the hourly rate when there is no daily rate', () => {
    expect(formatRates(500, null)).toBe('$5.00/hr');
    expect(formatRates(500, undefined)).toBe('$5.00/hr');
  });
  it('shows only the daily rate when there is no hourly rate', () => {
    expect(formatRates(null, 4000)).toBe('$40.00/day');
  });
  it('falls back to the space rate when neither is set', () => {
    expect(formatRates(null, null)).toBe('Standard space rate');
    expect(formatRates(undefined, undefined)).toBe('Standard space rate');
  });
});
