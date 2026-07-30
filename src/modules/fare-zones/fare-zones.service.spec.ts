import { NotFoundException } from '@nestjs/common';
import { FareZonesService } from './fare-zones.service';

describe('FareZonesService', () => {
  let service: FareZonesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      fareZone: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new FareZonesService(prisma);
  });

  it('converts Decimal fields to plain numbers when listing zones', async () => {
    prisma.fareZone.findMany.mockResolvedValue([
      {
        id: 'zone-1',
        zoneName: 'Centro',
        baseFare: 20,
        farePerKm: 5,
        centerLat: 14.1,
        centerLng: -87.2,
      },
    ]);

    const result = await service.list();

    expect(result).toEqual([
      {
        id: 'zone-1',
        zoneName: 'Centro',
        baseFare: 20,
        farePerKm: 5,
        centerLat: 14.1,
        centerLng: -87.2,
      },
    ]);
  });

  it('creates a fare zone from the provided dto', () => {
    const dto = {
      zoneName: 'Centro',
      baseFare: 20,
      farePerKm: 5,
      centerLat: 14.1,
      centerLng: -87.2,
    };
    service.create(dto);
    expect(prisma.fareZone.create).toHaveBeenCalledWith({ data: dto });
  });

  it('throws NotFoundException when updating a zone that does not exist', async () => {
    prisma.fareZone.findUnique.mockResolvedValue(null);
    await expect(
      service.update('missing', { baseFare: 25 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.fareZone.update).not.toHaveBeenCalled();
  });

  it('updates an existing zone', async () => {
    prisma.fareZone.findUnique.mockResolvedValue({ id: 'zone-1' });
    prisma.fareZone.update.mockResolvedValue({ id: 'zone-1', baseFare: 25 });

    await service.update('zone-1', { baseFare: 25 });

    expect(prisma.fareZone.update).toHaveBeenCalledWith({
      where: { id: 'zone-1' },
      data: { baseFare: 25 },
    });
  });
});
