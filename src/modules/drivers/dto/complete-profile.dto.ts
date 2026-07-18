import { IsString, IsInt, IsEnum, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum VehicleType {
  car = 'car',
  motorcycle = 'motorcycle',
}

class VehicleDto {
  @IsString() brand!: string;
  @IsString() model!: string;
  @IsInt() year!: number;
  @IsString() color!: string;
  @IsString() plate!: string;
}

export class CompleteProfileDto {
  @IsEnum(VehicleType) vehicleType!: VehicleType;
  @IsString() licenseNumber!: string;
  @ValidateNested() @Type(() => VehicleDto) vehicle!: VehicleDto;

  @IsUrl() idFrontUrl!: string;
  @IsUrl() idBackUrl!: string;
  @IsUrl() vehicleRegistrationUrl!: string;
  @IsUrl() selfieWithIdUrl!: string;
  @IsUrl() profilePhotoUrl!: string;
}