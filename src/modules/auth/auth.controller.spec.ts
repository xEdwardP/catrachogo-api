import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<
    Pick<
      AuthService,
      | 'register'
      | 'login'
      | 'loginWithGoogle'
      | 'updateProfilePhoto'
      | 'completePhone'
      | 'updateName'
      | 'getProfile'
    >
  >;
  let googleAuthService: jest.Mocked<Pick<GoogleAuthService, 'verify'>>;

  beforeEach(() => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      loginWithGoogle: jest.fn(),
      updateProfilePhoto: jest.fn(),
      completePhone: jest.fn(),
      updateName: jest.fn(),
      getProfile: jest.fn(),
    };
    googleAuthService = { verify: jest.fn() };

    controller = new AuthController(
      authService as unknown as AuthService,
      googleAuthService as unknown as GoogleAuthService,
    );
  });

  it('passes the mobile platform header through to register', () => {
    const dto = { email: 'juan@example.com' } as any;
    controller.register(dto, 'mobile');
    expect(authService.register).toHaveBeenCalledWith(dto, 'mobile');
  });

  it('passes the mobile platform header through to login', () => {
    const dto = { email: 'juan@example.com', password: 'pw' } as any;
    controller.login(dto, 'mobile');
    expect(authService.login).toHaveBeenCalledWith(
      'juan@example.com',
      'pw',
      'mobile',
    );
  });

  it('verifies the Google id token before delegating to loginWithGoogle', async () => {
    googleAuthService.verify.mockResolvedValue({
      googleId: 'g-1',
      email: 'juan@example.com',
      name: 'Juan',
    });

    await controller.loginWithGoogle({ idToken: 'raw-token' }, 'mobile');

    expect(googleAuthService.verify).toHaveBeenCalledWith('raw-token');
    expect(authService.loginWithGoogle).toHaveBeenCalledWith(
      { googleId: 'g-1', email: 'juan@example.com', name: 'Juan' },
      'mobile',
    );
  });

  it('reads the authenticated user id from the request for profile-photo updates', () => {
    const req = { user: { userId: 'user-1' } };
    controller.updateProfilePhoto(req as any, { profilePhotoUrl: 'new.jpg' });
    expect(authService.updateProfilePhoto).toHaveBeenCalledWith(
      'user-1',
      'new.jpg',
    );
  });

  it('reads the authenticated user id from the request for profile lookups', () => {
    const req = { user: { userId: 'user-1' } };
    controller.getProfile(req as any);
    expect(authService.getProfile).toHaveBeenCalledWith('user-1');
  });
});
