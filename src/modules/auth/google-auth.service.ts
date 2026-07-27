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
  private client = new OAuth2Client();

  // Web y mobile usan Google Client IDs distintos; se acepta cualquiera de
  // los configurados como audiencia válida del ID token.
  private readonly validAudiences = [
    getEnvOrThrow('GOOGLE_CLIENT_ID'),
    ...(process.env.GOOGLE_CLIENT_ID_MOBILE?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? []),
  ];

  async verify(idToken: string): Promise<GooglePayload> {
    const ticket = await this.client
      .verifyIdToken({
        idToken,
        audience: this.validAudiences,
      })
      .catch(() => {
        throw new UnauthorizedException('Invalid Google token');
      });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token payload');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? 'Usuario',
      picture: payload.picture,
    };
  }
}
