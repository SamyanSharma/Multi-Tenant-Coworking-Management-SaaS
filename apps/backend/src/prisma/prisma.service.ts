import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 removed automatic env-based DB connection at runtime — any
// PrismaClient instantiation now requires an explicit driver adapter, or
// it fails with PrismaClientInitializationError only once a real query is
// attempted (not at startup, which is what made this easy to miss during
// the Stage 1-4 merge — see PROGRESS.md's Key Decisions Log).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
