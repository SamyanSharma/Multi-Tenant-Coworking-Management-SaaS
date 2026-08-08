import { Role } from '@prisma/client';

// Augments Express's Request type so req.spaceId / req.userRole are typed
// everywhere downstream (controllers, services) without casting.
declare module 'express' {
  interface Request {
    spaceId?: string;
    userRole?: Role;
  }
}
