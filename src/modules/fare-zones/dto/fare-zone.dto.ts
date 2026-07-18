import { IsString, IsNumber } from 'class-validator';

export class FareZoneDto {
  @IsString() zoneName!: string;
  @IsNumber() baseFare!: number;
  @IsNumber() farePerKm!: number;
  @IsNumber() centerLat!: number;
  @IsNumber() centerLng!: number;
}
