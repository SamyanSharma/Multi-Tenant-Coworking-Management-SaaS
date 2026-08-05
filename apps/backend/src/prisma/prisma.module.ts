import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // makes PrismaService injectable everywhere without re-importing PrismaModule in every feature module
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
