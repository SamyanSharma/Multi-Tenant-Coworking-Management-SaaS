import type { Request } from 'express';


export function getCallerUserId(req: Request): string {
  return req.headers['x-user-id'] as string;
}
