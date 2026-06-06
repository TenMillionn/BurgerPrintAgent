import {
  BadRequestException,
  Controller,
  InternalServerErrorException,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ApiAuth } from '../common/decorators/http.decorators';
import { R2Service } from './r2.service';

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Image upload for design/mockup artwork → Cloudflare R2. Auth-guarded globally. */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly r2: R2Service,
    private readonly config: ConfigService,
  ) {}

  @ApiAuth({ summary: 'Upload a design/mockup image' })
  @ApiConsumes('multipart/form-data')
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: UploadedImage | undefined,
    @Req() req: any,
  ): Promise<{ url: string; key: string; contentType: string; size: number }> {
    if (!file || !file.size) {
      throw new BadRequestException({ code: 'EMPTY_FILE', message: 'No file uploaded' });
    }
    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'Only PNG, JPEG, or WebP images are allowed',
      });
    }
    const max = this.config.get<number>('uploadMaxBytes') as number;
    if (file.size > max) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `Image exceeds the ${Math.round(max / 1024 / 1024)} MB limit`,
      });
    }

    const key = `designs/${req.user._id}/${randomUUID()}.${ext}`;
    try {
      const url = await this.r2.put(file.buffer, file.mimetype, key);
      return { url, key, contentType: file.mimetype, size: file.size };
    } catch {
      throw new InternalServerErrorException({
        code: 'UPLOAD_FAILED',
        message: 'Could not upload the image',
      });
    }
  }
}
