import { computeCapacity } from './capacity';

describe('computeCapacity', () => {
  it('is desks (1 seat each) plus room capacity', () => {
    expect(computeCapacity(1, 4)).toBe(5);
    expect(computeCapacity(3, 14)).toBe(17);
    expect(computeCapacity(0, 0)).toBe(0);
  });
});
