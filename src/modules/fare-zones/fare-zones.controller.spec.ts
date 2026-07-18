import { Test, TestingModule } from '@nestjs/testing';
import { FareZonesController } from './fare-zones.controller';

describe('FareZonesController', () => {
  let controller: FareZonesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FareZonesController],
    }).compile();

    controller = module.get<FareZonesController>(FareZonesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
