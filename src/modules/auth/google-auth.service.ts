import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { getEnvOrThrow } from '../../common/utils/env.util';

export interface GooglePayload {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

@Injectable()
export class GoogleAuthService {
  private client = new OAuth2Client(getEnvOrThrow('GOOGLE_CLIENT_ID'));

  async verify(idToken: string): Promise<GooglePayload> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: getEnvOrThrow('GOOGLE_CLIENT_ID'),
    }).catch(() => {
      throw new UnauthorizedException('Invalid Google token');
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token payload');
    }

    return { googleId: payload.sub, email: payload.email, name: payload.name ?? 'Usuario', picture: payload.picture };
  }
}