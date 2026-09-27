import { Module } from '@nestjs/common';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule: SpacesService.join() reissues a JWT after a Member
  // joins a space (spaceId lives in the token), reusing
  // AuthService.buildAuthResult rather than duplicating token-signing
  // logic here.
  imports: [AuthModule],
  controllers: [SpacesController],
  providers: [SpacesService],
})
export class SpacesModule {}
