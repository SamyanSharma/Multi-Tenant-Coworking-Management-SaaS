import { Module } from '@nestjs/common';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { AuthModule } from '../auth/auth.module';

@Module({
 
  imports: [AuthModule],
  controllers: [SpacesController],
  providers: [SpacesService],
})
export class SpacesModule {}
