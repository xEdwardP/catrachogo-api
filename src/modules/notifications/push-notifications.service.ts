import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoPushTicket = {
  status: 'ok' | 'error';
  details?: { error?: string };
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async send(
    userIds: string | string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (ids.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, pushToken: { not: null } },
      select: { id: true, pushToken: true },
    });
    if (users.length === 0) return;

    const messages = users.map((user) => ({
      to: user.pushToken!,
      title,
      body,
      data,
      sound: 'default' as const,
      channelId: 'default',
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(messages),
      });
      const result = (await response.json()) as { data?: ExpoPushTicket[] };
      await this.clearStaleTokens(result.data ?? [], users);
    } catch (error) {
      this.logger.warn(
        `Failed to send push notification: ${(error as Error).message}`,
      );
    }
  }

  private async clearStaleTokens(
    tickets: ExpoPushTicket[],
    users: { id: string; pushToken: string | null }[],
  ) {
    const staleUserIds = tickets
      .map((ticket, index) =>
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
          ? users[index]?.id
          : null,
      )
      .filter((id): id is string => Boolean(id));

    if (staleUserIds.length === 0) return;
    await this.prisma.user.updateMany({
      where: { id: { in: staleUserIds } },
      data: { pushToken: null },
    });
  }
}
