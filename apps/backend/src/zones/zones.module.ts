import { Module } from '@nestjs/common';
import { DeletionModule } from '../deletion/deletion.module';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  imports: [DeletionModule],
  controllers: [ZonesController],
  providers: [ZonesService],
})
export class ZonesModule {}
