import { ExecutionContext, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new TenantGuard(reflector);
  });

  // Builds a fake ExecutionContext so we don't need a real HTTP server
  // just to test "does this guard read headers correctly."
  function mockContext(headers: Record<string, string>): {
    ctx: ExecutionContext;
    request: { headers: Record<string, string>; spaceId?: string };
  } {
    const request: { headers: Record<string, string>; spaceId?: string } = {
      headers,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  it('throws when x-space-id header is missing', () => {
    const { ctx } = mockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
  });

  it('throws when x-space-id is not a valid cuid shape', () => {
    const { ctx } = mockContext({ 'x-space-id': 'not-a-real-id' });
    expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
  });

  it('attaches spaceId to the request when valid', () => {
    const validId = 'cku8x2vwn0000abcd1234efgh';
    const { ctx, request } = mockContext({ 'x-space-id': validId });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.spaceId).toBe(validId);
  });

  it('bypasses the check when @SkipTenantCheck() metadata is present', () => {
    const skipReflector = {
      getAllAndOverride: () => true,
    } as unknown as Reflector;
    const skipGuard = new TenantGuard(skipReflector);
    const { ctx } = mockContext({}); // no header at all
    expect(skipGuard.canActivate(ctx)).toBe(true);
  });
});
