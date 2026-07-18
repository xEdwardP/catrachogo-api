import { IsLatitude, IsLongitude } from 'class-validator';

export class EstimateTripDto {
  @IsLatitude() originLat!: number;
  @IsLongitude() originLng!: number;
  @IsLatitude() destinationLat!: number;
  @IsLongitude() destinationLng!: number;
}