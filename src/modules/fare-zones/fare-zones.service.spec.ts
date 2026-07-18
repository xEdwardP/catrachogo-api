import { Test, TestingModule } from '@nestjs/testing';
import { FareZonesService } from './fare-zones.service';

describe('FareZonesService', () => {
  let service: FareZonesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FareZonesService],
    }).compile();

    service = module.get<FareZonesService>(FareZonesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
