import { Matches } from 'class-validator';

export function IsCloudinaryUrl() {
  return Matches(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//,
    {
      message: 'Must be a valid Cloudinary URL',
    },
  );
}
