import { Module } from '@nestjs/common';
import { DeletionModule } from '../deletion/deletion.module';
import { DesksController } from './desks.controller';
import { DesksService } from './desks.service';

@Module({
  imports: [DeletionModule],
  controllers: [DesksController],
  providers: [DesksService],
})
export class DesksModule {}
