import { PushNotificationsService } from './push-notifications.service';

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;
  let prisma: any;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn(), updateMany: jest.fn() },
    };
    service = new PushNotificationsService(prisma);
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing when no target user has a registered push token', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.send('user-1', 'Title', 'Body');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when called with an empty list of user ids', async () => {
    await service.send([], 'Title', 'Body');

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('never throws when the Expo push request fails', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', pushToken: 'ExponentPushToken[abc]' },
    ]);
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      service.send('user-1', 'Title', 'Body'),
    ).resolves.toBeUndefined();
  });

  it('clears the push token only for users whose ticket reports DeviceNotRegistered', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', pushToken: 'token-1' },
      { id: 'user-2', pushToken: 'token-2' },
    ]);
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: [
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
            { status: 'error', details: { error: 'MessageTooBig' } },
          ],
        }),
    });

    await service.send(['user-1', 'user-2'], 'Title', 'Body');

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1'] } },
      data: { pushToken: null },
    });
  });

  it('does not touch any tokens when every ticket succeeds', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', pushToken: 'token-1' },
    ]);
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
    });

    await service.send('user-1', 'Title', 'Body');

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
