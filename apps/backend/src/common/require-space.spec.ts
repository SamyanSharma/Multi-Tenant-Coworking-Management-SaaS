import { BadRequestException } from '@nestjs/common';
import { requireSpaceId } from './require-space';

describe('requireSpaceId', () => {
  it('returns the tenant when the guard set one', () => {
    expect(requireSpaceId({ spaceId: 'space-1' } as any)).toBe('space-1');
  });

  it('throws a 400 (not a 500, not a silent undefined) when there is no tenant', () => {
    expect(() => requireSpaceId({} as any)).toThrow(BadRequestException);
    expect(() => requireSpaceId({ spaceId: undefined } as any)).toThrow(/x-space-id/);
    expect(() => requireSpaceId({ spaceId: '' } as any)).toThrow(BadRequestException);
  });
});
