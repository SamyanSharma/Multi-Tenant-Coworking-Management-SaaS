import { describe, it, expect } from 'vitest';
import { computeCapacity } from '../capacity';

describe('computeCapacity', () => {
  it('counts one seat per desk plus every room capacity', () => {
    expect(computeCapacity(1, [4])).toBe(5);
    expect(computeCapacity(3, [4, 10])).toBe(17);
  });
  it('handles empty zones', () => {
    expect(computeCapacity(0, [])).toBe(0);
    expect(computeCapacity(2, [])).toBe(2);
    expect(computeCapacity(0, [6])).toBe(6);
  });
});
