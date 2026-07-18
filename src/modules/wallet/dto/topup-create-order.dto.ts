import { IsNumber, Min } from 'class-validator';

export class TopupCreateOrderDto {
  @IsNumber() @Min(1) amount!: number;
}
