import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// This module is global so that the PrismaService can be injected
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
