import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { getEnvOrThrow } from '../../common/utils/env.util';

const CLOUDINARY_URL_PATTERN =
  /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//;

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger('CloudinaryService');

  constructor() {
    cloudinary.config({
      cloud_name: getEnvOrThrow('CLOUDINARY_CLOUD_NAME'),
      api_key: getEnvOrThrow('CLOUDINARY_API_KEY'),
      api_secret: getEnvOrThrow('CLOUDINARY_API_SECRET'),
    });
  }

  isCloudinaryUrl(url: string): boolean {
    return CLOUDINARY_URL_PATTERN.test(url);
  }

  private extractPublicId(url: string): string | null {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^./]+$/);
    return match?.[1] ?? null;
  }

  async deleteByUrl(url: string): Promise<void> {
    if (!this.isCloudinaryUrl(url)) return;

    const publicId = this.extractPublicId(url);
    if (!publicId) {
      this.logger.warn(
        `Could not extract public_id from Cloudinary URL: ${url}`,
      );
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      this.logger.warn(
        `Failed to delete Cloudinary asset ${publicId}: ${error}`,
      );
    }
  }
}
