import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JWT_SECRET, JWT_EXPIRES_IN } from './jwt.constants';

@Module({
  imports: [
    // global: true means every other module (including JwtAuthGuard
    // and the Socket.io gateway, registered elsewhere) can inject
    // JwtService without importing JwtModule themselves.
    JwtModule.register({
      global: true,
      secret: JWT_SECRET,
      signOptions: { expiresIn: JWT_EXPIRES_IN },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
