import { Role } from '@prisma/client';

// Augments Express's Request type so req.spaceId 
declare module 'express' {
  interface Request {
    spaceId?: string;
    userRole?: Role;
  }
}
