import {
  Controller,
  Patch,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleAuthService } from './google-auth.service';
import { UpdateProfilePhotoDto } from './dto/update-profile-photo.dto';
import { CompletePhoneDto } from './dto/complete-phone.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private googleAuthService: GoogleAuthService,
  ) {}

  @Throttle({
    short: { limit: 2, ttl: 1_000 },
    medium: { limit: 10, ttl: 60_000 },
  })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({
    short: { limit: 2, ttl: 1_000 },
    medium: { limit: 10, ttl: 60_000 },
  })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('google')
  async loginWithGoogle(@Body() dto: GoogleLoginDto) {
    const payload = await this.googleAuthService.verify(dto.idToken);
    return this.authService.loginWithGoogle(payload);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile-photo')
  updateProfilePhoto(@Request() req, @Body() dto: UpdateProfilePhotoDto) {
    return this.authService.updateProfilePhoto(
      req.user.userId,
      dto.profilePhotoUrl,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('phone')
  completePhone(@Request() req, @Body() dto: CompletePhoneDto) {
    return this.authService.completePhone(req.user.userId, dto.phone);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req) {
    return this.authService.getProfile(req.user.userId);
  }
}
