import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { DesignAsset } from './schemas/design-asset.schema';
import { R2Service } from '../uploads/r2.service';
import { ImageProcessingService } from './image-processing.service';
import { isAllowed, nearestAllowed } from './allowed-resolutions';

export interface DesignAssetView {
  image_id: string;
  side: string;
  url: string;
  width: number;
  height: number;
  valid: boolean;
  processed: boolean;
  created_at?: Date;
}

@Injectable()
export class DesignAssetService {
  private readonly logger = new Logger(DesignAssetService.name);

  constructor(
    @InjectModel(DesignAsset.name)
    private readonly model: Model<DesignAsset>,
    private readonly r2: R2Service,
    private readonly images: ImageProcessingService,
    private readonly http: HttpService,
  ) {}

  private view(a: any): DesignAssetView {
    return {
      image_id: String(a._id),
      side: a.side,
      url: a.url,
      width: a.width,
      height: a.height,
      valid: a.valid,
      processed: a.processed,
      created_at: a.createdAt,
    };
  }

  /** Persist an uploaded image (dimensions already read). */
  async create(input: {
    conversationId: string;
    userId: string;
    side: string;
    url: string;
    key: string;
    width: number;
    height: number;
    agentMessageRef?: string;
    processed?: boolean;
    sourceAssetId?: string;
  }): Promise<DesignAssetView> {
    const doc = await this.model.create({
      ...input,
      valid: isAllowed(input.width, input.height),
      processed: input.processed ?? false,
    });
    return this.view(doc.toObject());
  }

  async findById(id: string, userId: string): Promise<any | null> {
    const a = await this.model.findById(id).lean();
    if (!a || String(a.userId) !== String(userId)) return null;
    return a;
  }

  async listByConversation(
    conversationId: string,
    userId: string,
  ): Promise<DesignAssetView[]> {
    const rows = await this.model
      .find({ conversationId, userId })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((r) => this.view(r));
  }

  /** Newest asset for a side (any validity). */
  async latest(
    conversationId: string,
    userId: string,
    side: string,
  ): Promise<any | null> {
    return this.model
      .findOne({ conversationId, userId, side })
      .sort({ createdAt: -1 })
      .lean();
  }

  /** Newest VALID asset for a side — used to resolve the design at order time. */
  async latestValid(
    conversationId: string,
    userId: string,
    side: string,
  ): Promise<any | null> {
    return this.model
      .findOne({ conversationId, userId, side, valid: true })
      .sort({ createdAt: -1 })
      .lean();
  }

  /** Resize/crop an asset to the nearest allowed resolution; store + return the new asset. */
  async process(assetId: string, userId: string): Promise<DesignAssetView> {
    const src = await this.findById(assetId, userId);
    if (!src) throw new Error('Asset not found');

    const res = await firstValueFrom(
      this.http.get<ArrayBuffer>(src.url, { responseType: 'arraybuffer' }),
    );
    const buf = Buffer.from(res.data);
    const [w, h] = nearestAllowed(src.width, src.height);
    const out = await this.images.resizeCrop(buf, w, h);

    const key = `designs/${userId}/${randomUUID()}.png`;
    const url = await this.r2.put(out, 'image/png', key);

    return this.create({
      conversationId: src.conversationId,
      userId,
      side: src.side,
      url,
      key,
      width: w,
      height: h,
      agentMessageRef: src.agentMessageRef,
      processed: true,
      sourceAssetId: String(src._id),
    });
  }
}
