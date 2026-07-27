import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelTripDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
