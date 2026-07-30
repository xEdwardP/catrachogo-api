import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { RegisterRole } from './dto/register.dto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: { sign: jest.Mock };
  let cloudinary: jest.Mocked<Pick<CloudinaryService, 'deleteByUrl'>>;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-jwt') };
    cloudinary = { deleteByUrl: jest.fn() };

    service = new AuthService(
      prisma,
      jwt as any,
      cloudinary as unknown as CloudinaryService,
    );
  });

  describe('register', () => {
    const dto = {
      name: 'Juan',
      email: 'juan@example.com',
      phone: '+50412345678',
      password: 'supersecret',
      role: RegisterRole.passenger,
    };

    it('rejects when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' }); // email lookup

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects when the phone number is already in use', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // email lookup: free
        .mockResolvedValueOnce({ id: 'existing' }); // phone lookup: taken

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes the password and issues a token on success', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'user-1', ...data }),
      );

      const result = await service.register(dto);

      const createdData = prisma.user.create.mock.calls[0][0].data;
      expect(createdData.passwordHash).not.toBe(dto.password);
      expect(await argon2.verify(createdData.passwordHash, dto.password)).toBe(
        true,
      );
      expect(result).toEqual({
        id: 'user-1',
        name: dto.name,
        email: dto.email,
        role: dto.role,
        token: 'signed-jwt',
      });
    });

    it('uses the mobile JWT expiration when the mobile platform header is present', async () => {
      process.env.JWT_EXPIRES_IN_MOBILE = '2592000';
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'user-1', ...data }),
      );

      await service.register(dto, 'mobile');

      expect(jwt.sign).toHaveBeenCalledWith(expect.any(Object), {
        expiresIn: 2592000,
      });
      delete process.env.JWT_EXPIRES_IN_MOBILE;
    });
  });

  describe('login', () => {
    it('rejects when no user has that email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login('missing@example.com', 'pw'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a Google-only account (no password hash set)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: null,
      });
      await expect(
        service.login('juan@example.com', 'pw'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash });

      await expect(
        service.login('juan@example.com', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns a token on correct credentials', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Juan',
        role: 'passenger',
        passwordHash,
      });

      const result = await service.login(
        'juan@example.com',
        'correct-password',
      );

      expect(result).toEqual({
        token: 'signed-jwt',
        user: { id: 'user-1', name: 'Juan', role: 'passenger' },
      });
    });
  });

  describe('loginWithGoogle', () => {
    const payload = {
      googleId: 'g-1',
      email: 'juan@example.com',
      name: 'Juan',
      picture: 'http://pic',
    };

    it('creates a new passenger account when no user matches by googleId or email', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // both googleId and email lookups
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Juan',
        role: 'passenger',
      });

      await service.loginWithGoogle(payload);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: payload.email,
          googleId: payload.googleId,
          role: 'passenger',
        }),
      });
    });

    it('links the googleId to an existing account found by email, preserving an existing photo', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // no user with this googleId yet
        .mockResolvedValueOnce({
          id: 'user-1',
          profilePhotoUrl: 'existing-photo.jpg',
        }); // found by email
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        name: 'Juan',
        role: 'passenger',
      });

      await service.loginWithGoogle(payload);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          googleId: payload.googleId,
          profilePhotoUrl: 'existing-photo.jpg',
        },
      });
    });

    it('reuses an already-linked google account without touching the database again', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        name: 'Juan',
        role: 'passenger',
      });

      await service.loginWithGoogle(payload);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateProfilePhoto', () => {
    it('deletes the previous Cloudinary photo when one existed', async () => {
      prisma.user.findUnique.mockResolvedValue({ profilePhotoUrl: 'old.jpg' });
      prisma.user.update.mockResolvedValue({ profilePhotoUrl: 'new.jpg' });

      await service.updateProfilePhoto('user-1', 'new.jpg');

      expect(cloudinary.deleteByUrl).toHaveBeenCalledWith('old.jpg');
    });

    it('does not attempt a delete when there was no previous photo', async () => {
      prisma.user.findUnique.mockResolvedValue({ profilePhotoUrl: null });
      prisma.user.update.mockResolvedValue({ profilePhotoUrl: 'new.jpg' });

      await service.updateProfilePhoto('user-1', 'new.jpg');

      expect(cloudinary.deleteByUrl).not.toHaveBeenCalled();
    });
  });

  describe('completePhone', () => {
    it('rejects when the phone number belongs to a different user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'other-user' });

      await expect(
        service.completePhone('user-1', '+50412345678'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows re-saving the same phone number for the same user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.user.update.mockResolvedValue({ phone: '+50412345678' });

      await expect(
        service.completePhone('user-1', '+50412345678'),
      ).resolves.toEqual({ phone: '+50412345678' });
    });
  });
});
