import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cloudinary: CloudinaryService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        wallet: { create: { balance: 0 } },
      },
    });

    const token = this.jwt.sign({ sub: user.id, role: user.role });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token,
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google Sign-In, not a password',
      );
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.jwt.sign({ sub: user.id, role: user.role });
    return { token, user: { id: user.id, name: user.name, role: user.role } };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        profilePhotoUrl: true,
        createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async loginWithGoogle(googlePayload: {
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }) {
    let user = await this.prisma.user.findUnique({
      where: { googleId: googlePayload.googleId },
    });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: googlePayload.email },
      });

      user = existingByEmail
        ? await this.prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              googleId: googlePayload.googleId,
              profilePhotoUrl:
                existingByEmail.profilePhotoUrl ?? googlePayload.picture,
            },
          })
        : await this.prisma.user.create({
            data: {
              name: googlePayload.name,
              email: googlePayload.email,
              phone: null,
              googleId: googlePayload.googleId,
              profilePhotoUrl: googlePayload.picture,
              role: 'passenger',
              wallet: { create: { balance: 0 } },
            },
          });
    }

    const token = this.jwt.sign({ sub: user.id, role: user.role });
    return { token, user: { id: user.id, name: user.name, role: user.role } };
  }

  async updateProfilePhoto(userId: string, profilePhotoUrl: string) {
    const previous = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profilePhotoUrl: true },
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profilePhotoUrl },
    });

    if (previous?.profilePhotoUrl) {
      await this.cloudinary.deleteByUrl(previous.profilePhotoUrl);
    }

    return { profilePhotoUrl: user.profilePhotoUrl };
  }

  async updateName(userId: string, name: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name },
    });
    return { name: user.name };
  }

  async completePhone(userId: string, phone: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Phone number already in use');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phone },
    });
    return { phone: user.phone };
  }
}
