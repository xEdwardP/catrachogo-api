import { IsLatitude, IsLongitude, IsString } from 'class-validator';

export class CreateTripDto {
  @IsLatitude() originLat!: number;
  @IsLongitude() originLng!: number;
  @IsString() originAddress!: string;
  @IsLatitude() destinationLat!: number;
  @IsLongitude() destinationLng!: number;
  @IsString() destinationAddress!: string;
}
