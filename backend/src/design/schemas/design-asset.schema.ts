import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DesignAssetDocument = DesignAsset & Document;

/**
 * A print (design) image uploaded — or produced by resize/crop — for a conversation.
 * Carries the metadata needed to attribute it: which conversation, which side, and
 * which agent turn (upload card) it belongs to.
 */
@Schema({ timestamps: true })
export class DesignAsset {
  @Prop({ required: true, index: true })
  conversationId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, enum: ['front', 'back'] })
  side: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  width: number;

  @Prop({ required: true })
  height: number;

  /** Dimensions match an allowed factory resolution. */
  @Prop({ required: true, default: false })
  valid: boolean;

  /** Produced by an auto resize/crop step. */
  @Prop({ default: false })
  processed: boolean;

  /** The original asset this one was processed from (if any). */
  @Prop()
  sourceAssetId?: string;

  /** The agent turn the upload card was attached to: upload-<sessionId>-<turn>-<side>. */
  @Prop()
  agentMessageRef?: string;
}

export const DesignAssetSchema = SchemaFactory.createForClass(DesignAsset);
