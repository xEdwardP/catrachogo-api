import { IsIn } from 'class-validator';

export class ResolveWithdrawalDto {
  @IsIn(['completed', 'rejected']) status!: 'completed' | 'rejected';
}
