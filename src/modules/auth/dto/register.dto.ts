import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export enum RegisterRole {
  passenger = 'passenger',
  driver = 'driver',
}

export class RegisterDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsString() phone!: string;
  @MinLength(8) password!: string;
  @IsEnum(RegisterRole) role!: RegisterRole;
}
