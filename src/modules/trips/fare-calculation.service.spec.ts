import { Test, TestingModule } from '@nestjs/testing';
import { FareCalculationService } from './fare-calculation.service';

describe('FareCalculationService', () => {
  let service: FareCalculationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FareCalculationService],
    }).compile();

    service = module.get<FareCalculationService>(FareCalculationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
