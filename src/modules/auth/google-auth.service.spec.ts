import { UnauthorizedException } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';

describe('GoogleAuthService', () => {
  const originalWebId = process.env.GOOGLE_CLIENT_ID;
  const originalMobileIds = process.env.GOOGLE_CLIENT_ID_MOBILE;

  afterEach(() => {
    if (originalWebId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalWebId;
    if (originalMobileIds === undefined)
      delete process.env.GOOGLE_CLIENT_ID_MOBILE;
    else process.env.GOOGLE_CLIENT_ID_MOBILE = originalMobileIds;
  });

  it('builds its accepted audience from both the web and mobile client ids', () => {
    process.env.GOOGLE_CLIENT_ID = 'web-client-id';
    process.env.GOOGLE_CLIENT_ID_MOBILE = 'mobile-id-1, mobile-id-2,';

    const service = new GoogleAuthService();

    expect((service as any).validAudiences).toEqual([
      'web-client-id',
      'mobile-id-1',
      'mobile-id-2',
    ]);
  });

  it('accepts a web-only configuration when no mobile client ids are set', () => {
    process.env.GOOGLE_CLIENT_ID = 'web-client-id';
    delete process.env.GOOGLE_CLIENT_ID_MOBILE;

    const service = new GoogleAuthService();

    expect((service as any).validAudiences).toEqual(['web-client-id']);
  });

  describe('verify', () => {
    let service: GoogleAuthService;

    beforeEach(() => {
      process.env.GOOGLE_CLIENT_ID = 'web-client-id';
      delete process.env.GOOGLE_CLIENT_ID_MOBILE;
      service = new GoogleAuthService();
    });

    it('throws UnauthorizedException when the Google token cannot be verified', async () => {
      (service as any).client.verifyIdToken = jest
        .fn()
        .mockRejectedValue(new Error('invalid token'));

      await expect(service.verify('bad-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the payload is missing sub or email', async () => {
      (service as any).client.verifyIdToken = jest.fn().mockResolvedValue({
        getPayload: () => ({ sub: undefined, email: undefined }),
      });

      await expect(service.verify('token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('returns the mapped Google payload on success', async () => {
      (service as any).client.verifyIdToken = jest.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-id-1',
          email: 'juan@example.com',
          name: 'Juan',
          picture: 'http://pic',
        }),
      });

      const result = await service.verify('token');

      expect(result).toEqual({
        googleId: 'google-id-1',
        email: 'juan@example.com',
        name: 'Juan',
        picture: 'http://pic',
      });
    });

    it('defaults the name to "Usuario" when Google does not provide one', async () => {
      (service as any).client.verifyIdToken = jest.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-id-1',
          email: 'juan@example.com',
        }),
      });

      const result = await service.verify('token');

      expect(result.name).toBe('Usuario');
    });
  });
});
