import { NotificationsService } from './notifications.service';
import { PushNotificationsService } from './push-notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let push: jest.Mocked<Pick<PushNotificationsService, 'send'>>;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findMany: jest.fn(), update: jest.fn() },
    };
    push = { send: jest.fn() };

    service = new NotificationsService(
      prisma,
      push as unknown as PushNotificationsService,
    );
  });

  it('persists the notification row and forwards it as a push notification', async () => {
    prisma.notification.create.mockResolvedValue({ id: 'notif-1' });

    await service.create('user-1', 'trip_accepted', 'Title', 'Body', 'trip-1');

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'trip_accepted',
        title: 'Title',
        body: 'Body',
        relatedTripId: 'trip-1',
      },
    });
    expect(push.send).toHaveBeenCalledWith('user-1', 'Title', 'Body', {
      type: 'trip_accepted',
      relatedTripId: 'trip-1',
    });
  });

  it('pushes only to admin users', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ]);

    await service.pushToAdmins('Title', 'Body');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'admin' },
      select: { id: true },
    });
    expect(push.send).toHaveBeenCalledWith(
      ['admin-1', 'admin-2'],
      'Title',
      'Body',
      undefined,
    );
  });

  it('marks a notification as read only for its owner', async () => {
    await service.markRead('notif-1', 'user-1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', userId: 'user-1' },
      data: { read: true },
    });
  });

  it('registers a push token for the user', async () => {
    await service.registerPushToken('user-1', 'ExponentPushToken[abc]');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pushToken: 'ExponentPushToken[abc]' },
    });
  });

  it('clears the push token when unregistering', async () => {
    await service.unregisterPushToken('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pushToken: null },
    });
  });

  it('returns a paginated list of notifications for the user', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: 'notif-1' }]);
    prisma.notification.count.mockResolvedValue(1);

    const result = await service.list('user-1', 1, 20);

    expect(result).toEqual({
      data: [{ id: 'notif-1' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });
});
