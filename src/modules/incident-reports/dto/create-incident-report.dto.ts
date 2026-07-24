import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const CATEGORIES = [
  'safety',
  'driver_behavior',
  'vehicle_condition',
  'payment',
  'other',
] as const;

export class CreateIncidentReportDto {
  @IsUUID()
  tripId!: string;

  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description!: string;
}
