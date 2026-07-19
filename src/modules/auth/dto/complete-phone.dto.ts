import { IsString, Matches } from 'class-validator';

export class CompletePhoneDto {
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'Phone must be a valid number (8-15 digits, optional +)',
  })
  phone!: string;
}
