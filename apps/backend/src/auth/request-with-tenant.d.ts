import { Role } from '@prisma/client';

declare module 'express' {
  interface Request {
    spaceId?: string;
    userRole?: Role;
  }
}
