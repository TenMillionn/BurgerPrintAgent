import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ApiAuth } from '../common/decorators/http.decorators';
import { R2Service } from '../uploads/r2.service';
import { ImageProcessingService } from './image-processing.service';
import { DesignAssetService } from './design-asset.service';

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

/** Print-file (design) uploads + asset listing. Auth enforced by the global guard. */
@ApiTags('design')
@Controller()
export class DesignController {
  constructor(
    private readonly r2: R2Service,
    private readonly images: ImageProcessingService,
    private readonly assets: DesignAssetService,
    private readonly config: ConfigService,
  ) {}

  @ApiAuth({ summary: 'Upload a design (print) file for a side' })
  @ApiConsumes('multipart/form-data')
  @Post('uploads/design')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: UploadedImage | undefined,
    @Body() body: { side?: string; conversationId?: string; ref?: string },
    @Req() req: any,
  ) {
    if (!file || !file.size) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'No file uploaded',
      });
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
    const side = body?.side === 'back' ? 'back' : 'front';
    const conversationId = (body?.conversationId ?? '').trim();
    if (!conversationId) {
      throw new BadRequestException({
        code: 'MISSING_CONVERSATION',
        message: 'conversationId is required',
      });
    }

    let dims: { width: number; height: number };
    try {
      dims = await this.images.dimensions(file.buffer);
    } catch {
      throw new BadRequestException({
        code: 'UNREADABLE_IMAGE',
        message: 'Could not read the image',
      });
    }

    const key = `designs/${req.user._id}/${randomUUID()}.${ext}`;
    let url: string;
    try {
      url = await this.r2.put(file.buffer, file.mimetype, key);
    } catch {
      throw new InternalServerErrorException({
        code: 'UPLOAD_FAILED',
        message: 'Could not upload the image',
      });
    }

    const asset = await this.assets.create({
      conversationId,
      userId: req.user._id,
      side,
      url,
      key,
      width: dims.width,
      height: dims.height,
      agentMessageRef: body?.ref,
    });
    return {
      id: asset.image_id,
      url: asset.url,
      side: asset.side,
      width: asset.width,
      height: asset.height,
      valid: asset.valid,
    };
  }

  @ApiAuth({ summary: "List a conversation's design assets" })
  @Get('design/assets')
  async list(@Query('conversationId') conversationId: string, @Req() req: any) {
    return {
      assets: await this.assets.listByConversation(
        conversationId,
        req.user._id,
      ),
    };
  }
}
