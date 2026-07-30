import { Injectable } from '@nestjs/common';
import { paginationParams } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private push: PushNotificationsService,
  ) {}

  async create(
    userId: string,
    type: string,
    title: string,
    body: string,
    relatedTripId?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type: type as any, title, body, relatedTripId },
    });
    await this.push.send(userId, title, body, { type, relatedTripId });
    return notification;
  }

  async pushToAdmins(
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true },
    });
    await this.push.send(
      admins.map((admin) => admin.id),
      title,
      body,
      data,
    );
  }

  async pushOnly(
    userIds: string | string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    await this.push.send(userIds, title, body, data);
  }

  async list(userId: string, page = 1, limit = 20) {
    const { take, skip } = paginationParams(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { data, total, page, limit };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { count };
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async registerPushToken(userId: string, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: token },
    });
    return { registered: true };
  }

  async unregisterPushToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: null },
    });
    return { unregistered: true };
  }
}
