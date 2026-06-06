import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

/** Thin wrapper around sharp for reading dimensions and fixing a design to an exact size. */
@Injectable()
export class ImageProcessingService {
  /** Read pixel dimensions; throws if the buffer is not a readable image. */
  async dimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) {
      throw new Error('Could not read image dimensions');
    }
    return { width: meta.width, height: meta.height };
  }

  /** Resize + centre-crop (cover) to an exact target resolution, returning PNG bytes. */
  async resizeCrop(
    buffer: Buffer,
    width: number,
    height: number,
  ): Promise<Buffer> {
    return sharp(buffer)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
  }
}
