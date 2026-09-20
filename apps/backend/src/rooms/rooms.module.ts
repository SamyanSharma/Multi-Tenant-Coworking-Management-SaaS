import { Module } from '@nestjs/common';
import { DeletionModule } from '../deletion/deletion.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [DeletionModule],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
