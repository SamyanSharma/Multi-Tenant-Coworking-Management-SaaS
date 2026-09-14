import { describe, it, expect } from 'vitest';
import { formatRemaining } from '../PaymentStep';

describe('formatRemaining', () => {
  it('formats a full 15 minutes as 15:00', () => {
    expect(formatRemaining(15 * 60 * 1000)).toBe('15:00');
  });

  it('formats under a minute with a single-digit minute and padded seconds', () => {
    expect(formatRemaining(45 * 1000)).toBe('0:45');
  });

  it('pads seconds under 10 with a leading zero', () => {
    expect(formatRemaining(60 * 1000 + 5 * 1000)).toBe('1:05');
  });

  it('rounds up partial seconds rather than showing 0:00 a second early', () => {
    // 1500ms left should read as 2 seconds remaining, not 1 —
    // a user watching a countdown should never see it hit 0:00
    // before the actual deadline has passed.
    expect(formatRemaining(1500)).toBe('0:02');
  });

  it('formats exactly zero as 0:00', () => {
    expect(formatRemaining(0)).toBe('0:00');
  });
});
