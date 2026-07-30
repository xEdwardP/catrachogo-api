import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

describe('RatingsController', () => {
  let controller: RatingsController;
  let ratingsService: jest.Mocked<
    Pick<RatingsService, 'createRating' | 'getRatingsForUser'>
  >;

  beforeEach(() => {
    ratingsService = { createRating: jest.fn(), getRatingsForUser: jest.fn() };
    controller = new RatingsController(
      ratingsService as unknown as RatingsService,
    );
  });

  it('creates a rating on behalf of the authenticated user', () => {
    const req = { user: { userId: 'passenger-1' } };
    const dto = { tripId: 'trip-1', ratedId: 'driver-1', score: 5 } as any;

    controller.create(req as any, dto);

    expect(ratingsService.createRating).toHaveBeenCalledWith(
      'passenger-1',
      dto,
    );
  });

  it('defaults pagination to page 1 / limit 20 when listing ratings for a user', () => {
    controller.getForUser('user-1', undefined, undefined);
    expect(ratingsService.getRatingsForUser).toHaveBeenCalledWith(
      'user-1',
      1,
      20,
    );
  });

  it('parses page/limit query params when listing ratings for a user', () => {
    controller.getForUser('user-1', '2', '10');
    expect(ratingsService.getRatingsForUser).toHaveBeenCalledWith(
      'user-1',
      2,
      10,
    );
  });
});
