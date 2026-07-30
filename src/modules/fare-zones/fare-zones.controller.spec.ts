import {
  FareZonesController,
  AdminFareZonesController,
} from './fare-zones.controller';
import { FareZonesService } from './fare-zones.service';

describe('FareZonesController', () => {
  let controller: FareZonesController;
  let fareZonesService: jest.Mocked<Pick<FareZonesService, 'list'>>;

  beforeEach(() => {
    fareZonesService = { list: jest.fn() };
    controller = new FareZonesController(
      fareZonesService as unknown as FareZonesService,
    );
  });

  it('delegates zone listing to the service', () => {
    controller.list();
    expect(fareZonesService.list).toHaveBeenCalled();
  });
});

describe('AdminFareZonesController', () => {
  let controller: AdminFareZonesController;
  let fareZonesService: jest.Mocked<
    Pick<FareZonesService, 'create' | 'update'>
  >;

  beforeEach(() => {
    fareZonesService = { create: jest.fn(), update: jest.fn() };
    controller = new AdminFareZonesController(
      fareZonesService as unknown as FareZonesService,
    );
  });

  it('delegates zone creation to the service', () => {
    const dto = {
      zoneName: 'Centro',
      baseFare: 20,
      farePerKm: 5,
      centerLat: 14.1,
      centerLng: -87.2,
    };
    controller.create(dto);
    expect(fareZonesService.create).toHaveBeenCalledWith(dto);
  });

  it('delegates zone updates by id to the service', () => {
    controller.update('zone-1', { baseFare: 25 });
    expect(fareZonesService.update).toHaveBeenCalledWith('zone-1', {
      baseFare: 25,
    });
  });
});
