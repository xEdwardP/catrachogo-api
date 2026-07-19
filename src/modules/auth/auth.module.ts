import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { getEnvOrThrow } from '../../common/utils/env.util';
import { GoogleAuthService } from './google-auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: getEnvOrThrow('JWT_SECRET'),
      signOptions: { expiresIn: Number(process.env.JWT_EXPIRES_IN ?? 604800) },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleAuthService],
  exports: [JwtModule],
})
export class AuthModule {}
