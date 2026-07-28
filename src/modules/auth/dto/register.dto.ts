import { IsEmail, IsEnum, IsString, Matches, MinLength } from 'class-validator';

export enum RegisterRole {
  passenger = 'passenger',
  driver = 'driver',
}

export class RegisterDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'Phone must be a valid number (8-15 digits, optional +)',
  })
  phone!: string;
  @MinLength(8) password!: string;
  @IsEnum(RegisterRole) role!: RegisterRole;
}
