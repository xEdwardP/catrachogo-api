import { IsUrl } from 'class-validator';

export class UpdateProfilePhotoDto {
  @IsUrl() profilePhotoUrl!: string;
}