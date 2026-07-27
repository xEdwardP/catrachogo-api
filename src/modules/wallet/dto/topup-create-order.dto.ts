import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TopupCreateOrderDto {
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() returnUrl?: string;
  @IsOptional() @IsString() cancelUrl?: string;
}
