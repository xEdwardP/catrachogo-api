import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Client as GoogleMapsClient } from '@googlemaps/google-maps-services-js';
import { PrismaService } from '../../prisma/prisma.service';
import { getEnvOrThrow } from '../../common/utils/env.util';

@Injectable()
export class FareCalculationService {
  private readonly logger = new Logger('FareCalculation');
  private googleMaps = new GoogleMapsClient({});

  constructor(private prisma: PrismaService) {}

  async isWithinHonduras(lat: number, lng: number): Promise<boolean> {
    const result = await this.prisma.$queryRaw<{ within: boolean }[]>`
      SELECT ST_Contains(
        (SELECT geom FROM honduras_boundary LIMIT 1),
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      ) AS within
    `;
    return result[0]?.within ?? false;
  }

  async calculateDistanceKm(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<number> {
    try {
      const response = await this.googleMaps.directions({
        params: {
          origin: `${originLat},${originLng}`,
          destination: `${destLat},${destLng}`,
          key: getEnvOrThrow('GOOGLE_MAPS_API_KEY'),
        },
        timeout: 5000,
      });

      const meters = response.data.routes?.[0]?.legs?.[0]?.distance?.value;
      if (meters) return meters / 1000;

      this.logger.warn(
        'Google Directions no devolvió ruta, usando distancia en línea recta',
      );
    } catch (error) {
      this.logger.warn(
        `Google Directions falló, usando fallback PostGIS: ${error}`,
      );
    }

    return this.straightLineDistanceKm(originLat, originLng, destLat, destLng);
  }

  private async straightLineDistanceKm(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<{ distance_km: number }[]>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${destLng}, ${destLat}), 4326)::geography
      ) / 1000 AS distance_km
    `;
    const straight = result[0]?.distance_km ?? 0;
    return straight * 1.3;
  }

  async resolveClosestZone(originLat: number, originLng: number) {
    const [zone] = await this.prisma.$queryRaw<
      { id: string; base_fare: number; fare_per_km: number }[]
    >`
      SELECT id, base_fare, fare_per_km
      FROM fare_zones
      ORDER BY ST_Distance(
        ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography
      ) ASC
      LIMIT 1
    `;
    if (!zone)
      throw new InternalServerErrorException(
        'No fare zones configured — run the seed first',
      );
    return zone;
  }

  async estimate(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ) {
    if (
      !(await this.isWithinHonduras(originLat, originLng)) ||
      !(await this.isWithinHonduras(destLat, destLng))
    ) {
      throw new BadRequestException('Coordinates must be within Honduras');
    }
    const distanceKm = await this.calculateDistanceKm(
      originLat,
      originLng,
      destLat,
      destLng,
    );
    const zone = await this.resolveClosestZone(originLat, originLng);
    const fare = Number(zone.base_fare) + distanceKm * Number(zone.fare_per_km);
    return {
      distanceKm: Number(distanceKm.toFixed(2)),
      fare: Number(fare.toFixed(2)),
    };
  }
}
