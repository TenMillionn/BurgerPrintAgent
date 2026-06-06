import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false, collection: 'variants', timestamps: true })
export class Variant extends Document<string> {
  @Prop({ required: true, type: String, primaryKey: true })
  _id: string;

  @Prop({ required: true, unique: true, index: true })
  sku: string; // "EUG2400-Black-S"

  @Prop({ required: true, index: true })
  productShortCode: string; // nối Product

  @Prop({ index: true })
  productName: string;

  @Prop()
  sizeId: string;

  @Prop({ index: true })
  size: string;

  @Prop()
  colorId: string;

  @Prop({ index: true })
  color: string;

  @Prop()
  colorHex: string;

  @Prop({ required: true, index: true, type: Number })
  baseCost: number; // "14"/"16" → number (ĐỔI THEO SIZE)

  @Prop({ type: Number })
  secondSidePrice: number; // phí mặt in 2

  @Prop({ type: Number })
  defaultProfit: number; // gợi ý (xác minh ngữ nghĩa)

  @Prop({ required: true, index: true })
  partnerId: string; // = baseSku.location (KHÓA NỐI)

  @Prop({ index: true })
  partnerName: string; // "Rocky"/"Hatta"

  // ship US/WW có sẵn ở variant (per-country lấy ở shipping_rates)
  @Prop({ type: Number })
  shippingCostUs: number;

  @Prop({ type: Number })
  shippingAddingUs: number;

  @Prop({ type: Number })
  shippingCostWW: number;

  @Prop({ type: Number })
  shippingAddingWW: number;

  @Prop({ type: Boolean, default: true })
  inStock: boolean;

  @Prop()
  syncedAt: Date;
}

export const VariantSchema = SchemaFactory.createForClass(Variant);
