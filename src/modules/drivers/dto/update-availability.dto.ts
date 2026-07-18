import { IsBoolean } from 'class-validator';

export class UpdateAvailabilityDto {
  @IsBoolean() available!: boolean;
}