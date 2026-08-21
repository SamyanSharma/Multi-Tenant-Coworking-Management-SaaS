import { ExecutionContext, BadRequestException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { Reflector } from '@nestjs/core';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new TenantGuard(reflector);
  });

  // Helper: builds a fake ExecutionContext so we don't need a real HTTP server
  // just to test "does this guard read headers correctly."
  function mockContext(headers: Record<string, string>): ExecutionContext {
    const request = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('throws when x-space-id header is missing', () => {
    const ctx = mockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
  });

  it('throws when x-space-id is not a valid cuid shape', () => {
    const ctx = mockContext({ 'x-space-id': 'not-a-real-id' });
    expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
  });

  it('attaches spaceId to the request when valid', () => {
    const validId = 'cku8x2vwn0000abcd1234efgh';
    const request = { headers: { 'x-space-id': validId } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request['spaceId']).toBe(validId);
  });

  it('bypasses the check when @SkipTenantCheck() metadata is present', () => {
    const skipReflector = {
      getAllAndOverride: () => true,
    } as unknown as Reflector;
    const skipGuard = new TenantGuard(skipReflector);
    const ctx = mockContext({}); // no header at all
    expect(skipGuard.canActivate(ctx)).toBe(true);
  });
});
