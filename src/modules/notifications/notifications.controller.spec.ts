import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notifications: jest.Mocked<
    Pick<
      NotificationsService,
      | 'registerPushToken'
      | 'unregisterPushToken'
      | 'list'
      | 'unreadCount'
      | 'markRead'
      | 'markAllRead'
    >
  >;

  beforeEach(() => {
    notifications = {
      registerPushToken: jest.fn(),
      unregisterPushToken: jest.fn(),
      list: jest.fn(),
      unreadCount: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };
    controller = new NotificationsController(
      notifications as unknown as NotificationsService,
    );
  });

  it('registers a push token for the authenticated user', () => {
    const req = { user: { userId: 'user-1' } };
    controller.registerPushToken(req as any, {
      token: 'ExponentPushToken[abc]',
    });
    expect(notifications.registerPushToken).toHaveBeenCalledWith(
      'user-1',
      'ExponentPushToken[abc]',
    );
  });

  it('unregisters the push token for the authenticated user', () => {
    const req = { user: { userId: 'user-1' } };
    controller.unregisterPushToken(req as any);
    expect(notifications.unregisterPushToken).toHaveBeenCalledWith('user-1');
  });

  it('defaults pagination to page 1 / limit 20 when listing notifications', () => {
    const req = { user: { userId: 'user-1' } };
    controller.list(req as any, undefined, undefined);
    expect(notifications.list).toHaveBeenCalledWith('user-1', 1, 20);
  });

  it('marks a single notification as read for the authenticated user', () => {
    const req = { user: { userId: 'user-1' } };
    controller.markRead(req as any, 'notif-1');
    expect(notifications.markRead).toHaveBeenCalledWith('notif-1', 'user-1');
  });
});
