import type { Request } from 'express';

// user id authentication
export function getCallerUserId(req: Request): string {
  return req.headers['x-user-id'] as string;
}
