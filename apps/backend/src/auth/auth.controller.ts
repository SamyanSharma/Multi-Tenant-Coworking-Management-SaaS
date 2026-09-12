import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { Public } from './public.decorator';
import { SkipTenantCheck } from './skip-tenant-check.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Public: this is the one route a caller hits before they have a
  // JWT at all. SkipTenantCheck too — logging in isn't scoped to a
  // space yet (the space comes back inside the token/response).
  @Public()
  @SkipTenantCheck()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // Public/SkipTenantCheck for the same reason as login — a brand new
  // space doesn't exist yet when this request is made, so there's
  // nothing to scope it to.
  @Public()
  @SkipTenantCheck()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(
      dto.name,
      dto.email,
      dto.password,
      dto.spaceName,
    );
  }
}
