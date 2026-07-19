import { IsString, IsInt, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsCloudinaryUrl } from '../../../common/validators/is-cloudinary-url';

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

  @IsCloudinaryUrl() idFrontUrl!: string;
  @IsCloudinaryUrl() idBackUrl!: string;
  @IsCloudinaryUrl() vehicleRegistrationUrl!: string;
  @IsCloudinaryUrl() selfieWithIdUrl!: string;
  @IsCloudinaryUrl() profilePhotoUrl!: string;
}