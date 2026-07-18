import { IsString } from 'class-validator';

export class TopupConfirmDto {
  @IsString() orderId!: string;
}
