import { IsEmail, IsNumber, Min } from 'class-validator';

export class RequestWithdrawalDto {
  @IsEmail() paypalEmail!: string;
  @IsNumber() @Min(1) amount!: number;
}
