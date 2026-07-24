import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSavedAddressDto {
  @IsIn(['home', 'work', 'other'])
  label!: 'home' | 'work' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customLabel?: string;

  @IsString()
  address!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
