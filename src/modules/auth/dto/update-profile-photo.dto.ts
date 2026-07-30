import { IsCloudinaryUrl } from '../../../common/validators/is-cloudinary-url';

export class UpdateProfilePhotoDto {
  @IsCloudinaryUrl() profilePhotoUrl!: string;
}
