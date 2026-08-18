import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() is a deliberate shortcut for this project's size (per
// ARCHITECTURE.md's "simplicity tradeoff, not an oversight" pattern) —
// makes PrismaService injectable everywhere without importing PrismaModule
// in every feature module.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
